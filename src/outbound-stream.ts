export type WeiboChunkMode = "length" | "newline" | "raw";

type StreamDebugFn = (tag: string, data?: Record<string, unknown>) => void;

export type WeiboOutboundEmitFn = (params: {
  text: string;
  done: boolean;
  source: "partial" | "deliver" | "settled";
}) => Promise<void>;

type CreateWeiboOutboundStreamParams = {
  chunkMode: WeiboChunkMode;
  textChunkLimit: number;
  emit: WeiboOutboundEmitFn;
  chunkTextWithMode: (text: string, limit: number, mode: "length" | "newline") => Iterable<string>;
  streamDebug?: StreamDebugFn;
};

type StreamStateSnapshot = {
  hasSeenPartial: boolean;
  hasEmittedChunks: boolean;
  hasEmittedDone: boolean;
  newlineBufferLen: number;
  pendingDeliverBufferLen: number;
};

const PARAGRAPH_DELIMITER_RE = /\n[\t ]*\n+/g;

function findLastParagraphDelimiterEnd(value: string): number {
  let lastEnd = -1;
  let match: RegExpExecArray | null = null;
  while ((match = PARAGRAPH_DELIMITER_RE.exec(value)) !== null) {
    lastEnd = match.index + match[0].length;
  }
  return lastEnd;
}

function resolveDeltaFromSnapshot(previous: string, next: string): {
  delta: string;
  nextSnapshot: string;
  nonMonotonic: boolean;
} {
  if (!next || next === previous) {
    return { delta: "", nextSnapshot: next, nonMonotonic: false };
  }
  if (next.startsWith(previous)) {
    return {
      delta: next.slice(previous.length),
      nextSnapshot: next,
      nonMonotonic: false,
    };
  }
  if (previous.startsWith(next)) {
    return {
      delta: "",
      nextSnapshot: next,
      nonMonotonic: true,
    };
  }

  let prefixLen = 0;
  const maxLen = Math.min(previous.length, next.length);
  while (prefixLen < maxLen && previous.charCodeAt(prefixLen) === next.charCodeAt(prefixLen)) {
    prefixLen += 1;
  }
  return {
    delta: next.slice(prefixLen),
    nextSnapshot: next,
    nonMonotonic: true,
  };
}

export function createWeiboOutboundStream(params: CreateWeiboOutboundStreamParams) {
  const {
    chunkMode,
    textChunkLimit,
    emit,
    chunkTextWithMode,
    streamDebug,
  } = params;

  let hasSeenPartial = false;
  let hasEmittedChunks = false;
  let hasEmittedDone = false;
  let lastPartialSnapshot = "";
  let newlineBuffer = "";
  let pendingDeliverBuffer = "";

  const splitOutboundText = (text: string): string[] =>
    chunkMode === "raw"
      ? [text]
      : Array.from(chunkTextWithMode(text, textChunkLimit, chunkMode));

  const emitChunks = async (chunks: string[], markLastDone: boolean, source: "partial" | "deliver" | "settled"): Promise<boolean> => {
    const normalizedChunks = chunks.filter((chunk) => chunk.length > 0);
    streamDebug?.("emit_chunks_prepare", {
      candidateCount: chunks.length,
      normalizedCount: normalizedChunks.length,
      markLastDone,
      chunkMode,
      source,
    });
    if (normalizedChunks.length === 0) {
      return false;
    }

    for (let index = 0; index < normalizedChunks.length; index += 1) {
      const done = markLastDone && index === normalizedChunks.length - 1;
      await emit({
        text: normalizedChunks[index] ?? "",
        done,
        source,
      });
      hasEmittedChunks = true;
      if (done) {
        hasEmittedDone = true;
      }
    }
    return true;
  };

  const flushText = async (text: string, isFinal: boolean, source: "partial" | "deliver" | "settled"): Promise<boolean> => {
    if (chunkMode === "newline") {
      if (!isFinal) {
        newlineBuffer += text;
        const flushBoundary = findLastParagraphDelimiterEnd(newlineBuffer);
        streamDebug?.("newline_buffered", {
          source,
          incomingLen: text.length,
          bufferLen: newlineBuffer.length,
          flushBoundary,
        });
        if (flushBoundary <= 0) {
          return false;
        }
        const flushableText = newlineBuffer.slice(0, flushBoundary);
        newlineBuffer = newlineBuffer.slice(flushBoundary);
        streamDebug?.("newline_flush", {
          source,
          flushableLen: flushableText.length,
          remainingBufferLen: newlineBuffer.length,
        });
        return emitChunks(splitOutboundText(flushableText), false, source);
      }

      const textToSend = `${newlineBuffer}${text}`;
      newlineBuffer = "";
      return emitChunks(splitOutboundText(textToSend), true, source);
    }

    return emitChunks(splitOutboundText(text), isFinal, source);
  };

  const finalizeWithDoneMarker = async (source: "deliver" | "settled"): Promise<void> => {
    if (hasEmittedDone) {
      return;
    }
    const emitted = await flushText("", true, source);
    if (!emitted && hasEmittedChunks && !hasEmittedDone) {
      streamDebug?.("emit_done_marker", { source, reason: "final_without_text" });
      await emit({
        text: "",
        done: true,
        source,
      });
      hasEmittedDone = true;
    }
  };

  return {
    async pushPartialSnapshot(snapshot: string): Promise<void> {
      if (!snapshot) {
        return;
      }

      hasSeenPartial = true;
      const previousSnapshotLen = lastPartialSnapshot.length;
      const deltaResult = resolveDeltaFromSnapshot(lastPartialSnapshot, snapshot);
      lastPartialSnapshot = deltaResult.nextSnapshot;

      streamDebug?.("partial_snapshot", {
        snapshotLen: snapshot.length,
        prevLen: previousSnapshotLen,
        deltaLen: deltaResult.delta.length,
        nonMonotonic: deltaResult.nonMonotonic,
      });

      if (!deltaResult.delta) {
        return;
      }
      await flushText(deltaResult.delta, false, "partial");
    },

    async pushDeliverText(params: { text: string; isFinal: boolean }): Promise<void> {
      const text = params.text ?? "";
      if (!params.isFinal) {
        if (!hasSeenPartial && text.length > 0) {
          pendingDeliverBuffer += text;
          streamDebug?.("deliver_buffered", {
            kind: "block",
            incomingLen: text.length,
            pendingDeliverBufferLen: pendingDeliverBuffer.length,
          });
        }
        return;
      }

      if (hasSeenPartial) {
        if (text.length > 0) {
          await this.pushPartialSnapshot(text);
        }
        await finalizeWithDoneMarker("deliver");
        return;
      }

      const fallbackText = `${pendingDeliverBuffer}${text}`;
      pendingDeliverBuffer = "";
      await flushText(fallbackText, true, "deliver");
      await finalizeWithDoneMarker("deliver");
    },

    async settle(): Promise<void> {
      if (!hasSeenPartial && pendingDeliverBuffer.length > 0) {
        const buffered = pendingDeliverBuffer;
        pendingDeliverBuffer = "";
        await flushText(buffered, true, "settled");
      }
      await finalizeWithDoneMarker("settled");
    },

    snapshot(): StreamStateSnapshot {
      return {
        hasSeenPartial,
        hasEmittedChunks,
        hasEmittedDone,
        newlineBufferLen: newlineBuffer.length,
        pendingDeliverBufferLen: pendingDeliverBuffer.length,
      };
    },
  };
}
