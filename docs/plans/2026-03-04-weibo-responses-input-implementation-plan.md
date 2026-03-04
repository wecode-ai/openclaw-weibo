# Weibo Responses-Style Input Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Weibo inbound support for Responses-style user input items, including `input_text`, `input_image`, and `input_file`, while preserving backward compatibility with legacy `payload.text`.

**Architecture:** Keep the existing WebSocket transport envelope (`{ type: "message", payload: ... }`) and upgrade only the payload input language to a Responses-style shape. Internally, normalize inbound payloads into text parts plus media parts, then reuse OpenClaw’s standard inbound media pipeline (`saveMediaBuffer` + `buildAgentMediaPayload` + `finalizeInboundContext`) so image/file input reaches Claw the same way as Feishu-style media channels.

**Tech Stack:** TypeScript, Vitest, OpenClaw plugin SDK, WebSocket (`ws`)

---

### Task 1: Define the Responses-style inbound types

**Files:**
- Modify: `src/types.ts`
- Modify: `src/bot.ts`
- Test: `src/__tests__/weibo-responses-input.test.ts`

**Step 1: Write the failing test**

Create a new test file that asserts the plugin accepts:
- legacy `payload.text`
- `payload.input` with a `message` item containing `input_text`
- `payload.input` with a `message` item containing `input_image`
- `payload.input` with a `message` item containing `input_file`

Use a narrow parser-facing test shape first:

```ts
it("accepts responses-style input_text parts", async () => {
  const event = {
    type: "message",
    payload: {
      messageId: "msg_1",
      fromUserId: "123456",
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "hello" }],
        },
      ],
    },
  };

  expect(event.payload.input[0].content[0].type).toBe("input_text");
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/__tests__/weibo-responses-input.test.ts
```

Expected: FAIL because the file/types/parser helpers do not exist yet.

**Step 3: Write minimal implementation**

Add explicit Typescript types for:
- responses-style input container on Weibo message payload
- `message` item with `role`
- content parts:
  - `input_text`
  - `input_image`
  - `input_file`
- image/file `source` with `type: "base64"`

Do not add URL support in this phase.

Suggested shape:

```ts
export type WeiboResponseInputSource =
  | { type: "base64"; media_type: string; data: string };

export type WeiboResponseContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; source: WeiboResponseInputSource; filename?: string }
  | { type: "input_file"; source: WeiboResponseInputSource; filename?: string };
```

**Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run src/__tests__/weibo-responses-input.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/types.ts src/bot.ts src/__tests__/weibo-responses-input.test.ts
git commit -m "feat: add weibo responses-style inbound types"
```

### Task 2: Add payload normalization with legacy text fallback

**Files:**
- Modify: `src/bot.ts`
- Test: `src/__tests__/weibo-responses-input.test.ts`

**Step 1: Write the failing test**

Extend the new test file to verify normalization rules:
- prefer `payload.input` over `payload.text`
- concatenate `input_text` parts into a final text body
- if `payload.input` has no text parts, fallback to `payload.text`
- ignore unsupported roles for now (`system`, `developer`, `assistant`)
- ignore unsupported content items without crashing

Use an extraction helper target:

```ts
expect(
  normalizeWeiboInboundInput({
    text: "legacy",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "new" }],
      },
    ],
  }).text
).toBe("new");
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/__tests__/weibo-responses-input.test.ts
```

Expected: FAIL because `normalizeWeiboInboundInput` does not exist.

**Step 3: Write minimal implementation**

In `src/bot.ts`, add a pure helper that returns:
- `text: string`
- `images: Array<{ mimeType: string; filename?: string; base64: string }>`
- `files: Array<{ mimeType: string; filename?: string; base64: string }>`

Normalization rules:
- scan only `payload.input[*]` items where `type === "message"` and `role === "user"`
- collect `input_text` text in order
- collect `input_image` and `input_file` parts in order
- fallback to trimmed `payload.text` only when no text parts were found

Do not call OpenClaw runtime or file APIs in this helper.

**Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run src/__tests__/weibo-responses-input.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/bot.ts src/__tests__/weibo-responses-input.test.ts
git commit -m "feat: normalize weibo responses-style inbound input"
```

### Task 3: Persist `input_image` and `input_file` through the OpenClaw media pipeline

**Files:**
- Modify: `src/bot.ts`
- Test: `src/__tests__/weibo-responses-media.test.ts`

**Step 1: Write the failing test**

Create a focused bot test that mocks:
- `resolveWeiboAccount`
- `getWeiboRuntime`
- `core.channel.media.saveMediaBuffer`
- `core.channel.reply.finalizeInboundContext`

Assert that:
- `input_image` base64 is decoded and saved via `saveMediaBuffer`
- `input_file` base64 is decoded and saved via `saveMediaBuffer`
- the resulting saved paths are exposed through `MediaPath`, `MediaPaths`, `MediaType`, `MediaTypes`, `MediaUrl`, `MediaUrls`

Example expectation:

```ts
expect(saveMediaBufferMock).toHaveBeenCalledWith(
  expect.any(Buffer),
  "image/png",
  "inbound",
  expect.any(Number),
  "image.png",
);
```

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/__tests__/weibo-responses-media.test.ts
```

Expected: FAIL because media persistence has not been implemented.

**Step 3: Write minimal implementation**

In `src/bot.ts`:
- decode base64 using `Buffer.from(data, "base64")`
- validate non-empty decode result
- call `core.channel.media.saveMediaBuffer(...)` for each image/file part
- collect `{ path, contentType }` entries
- convert them with `buildAgentMediaPayload(...)` from `openclaw/plugin-sdk`
- spread the returned payload into `finalizeInboundContext(...)`

Use conservative MIME allowlists:
- images: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- files: allow pass-through for first implementation; trust provided `media_type` and let OpenClaw downstream decide how to process

Keep failure behavior soft:
- bad attachment should be skipped with logging
- valid text should still reach the agent

**Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run src/__tests__/weibo-responses-media.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/bot.ts src/__tests__/weibo-responses-media.test.ts
git commit -m "feat: route weibo image and file inputs through media pipeline"
```

### Task 4: Preserve existing text-only behavior

**Files:**
- Modify: `src/__tests__/bot.chunk-mode.test.ts`
- Modify: `src/bot.ts`

**Step 1: Write the failing test**

Add assertions that legacy events with only:

```ts
payload: {
  messageId: "inbound_1",
  fromUserId: "123456",
  text: "hello"
}
```

still:
- dispatch normally
- do not require `payload.input`
- do not attempt media saving

If useful, add a spy that ensures `saveMediaBuffer` is never called for legacy text-only input.

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/__tests__/bot.chunk-mode.test.ts
```

Expected: FAIL if the new parser accidentally makes `payload.input` mandatory or changes text handling.

**Step 3: Write minimal implementation**

Adjust `handleWeiboMessage(...)` so the normalized text path is fully backward compatible:
- legacy `payload.text` remains valid
- empty `payload.input` does not break legacy messages
- chunking/outbound reply flow remains untouched

**Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run src/__tests__/bot.chunk-mode.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/bot.ts src/__tests__/bot.chunk-mode.test.ts
git commit -m "test: preserve legacy weibo text-only inbound behavior"
```

### Task 5: Extend the simulator to emit Responses-style payloads

**Files:**
- Modify: `weibo-server.ts`
- Modify: `src/sim-page.ts`
- Test: `src/__tests__/sim-page.test.ts`

**Step 1: Write the failing test**

Add simulator-oriented tests for helper output that expose a Responses-style payload example or helper serialization. Keep the test on helper functions, not full browser HTML.

At minimum, add a test for a new helper that builds a sample inbound payload with:
- `text`
- `input`
- one `input_text`
- one `input_image`

**Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/__tests__/sim-page.test.ts
```

Expected: FAIL because the new helper/UI text does not exist yet.

**Step 3: Write minimal implementation**

Update the simulator so local testing can produce the new payload shape:
- keep existing text send path working
- add an optional image/file field in the simulator UI/API
- when image/file content is provided, emit a `payload.input` array using Responses-style content parts

Do not remove existing `/api/messages/send` behavior; make it additive.

**Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run src/__tests__/sim-page.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add weibo-server.ts src/sim-page.ts src/__tests__/sim-page.test.ts
git commit -m "feat: add responses-style inbound payloads to weibo simulator"
```

### Task 6: Document the upgraded inbound protocol

**Files:**
- Modify: `docs/dev/wiki.md`
- Test: none

**Step 1: Write the doc update**

Update the protocol wiki to describe:
- legacy `payload.text`
- new `payload.input`
- supported content part types:
  - `input_text`
  - `input_image`
  - `input_file`
- base64-only support in the first implementation
- compatibility rules and precedence

Use examples that match real code behavior, not aspirational future protocol.

**Step 2: Verify the doc matches implementation**

Run:

```bash
rg -n "payload.input|input_image|input_file|payload.text" docs/dev/wiki.md src/bot.ts src/types.ts weibo-server.ts
```

Expected: matching terminology across docs and code.

**Step 3: Commit**

```bash
git add docs/dev/wiki.md
git commit -m "docs: document weibo responses-style inbound inputs"
```

### Task 7: Run the focused verification suite

**Files:**
- Modify: none
- Test:
  - `src/__tests__/weibo-responses-input.test.ts`
  - `src/__tests__/weibo-responses-media.test.ts`
  - `src/__tests__/bot.chunk-mode.test.ts`
  - `src/__tests__/sim-page.test.ts`
  - optionally full suite

**Step 1: Run focused tests**

Run:

```bash
npx vitest run \
  src/__tests__/weibo-responses-input.test.ts \
  src/__tests__/weibo-responses-media.test.ts \
  src/__tests__/bot.chunk-mode.test.ts \
  src/__tests__/sim-page.test.ts
```

Expected: PASS

**Step 2: Run the full unit suite**

Run:

```bash
npm run test:unit
```

Expected: PASS

**Step 3: Run type-check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS

**Step 4: Commit final verification-only checkpoint**

```bash
git add .
git commit -m "test: verify weibo responses-style inbound support"
```

## Notes for the implementer

- Reuse OpenClaw’s existing media pipeline instead of inventing new inbound image semantics.
- Do not attempt URL-backed `input_image` or `input_file` in the first pass.
- Do not implement output-side Responses semantics in this feature.
- Keep malformed attachment handling non-fatal when text content is still usable.
- Prefer pure helpers for normalization so they can be tested without mocking the full runtime.
