/**
 * Skills 自动更新模块
 *
 * 通过心跳触发检查并更新 skills 文件，支持：
 * - 更新现有 skill 的文件
 * - 新增 skill（远程有、本地没有）
 */

import * as fs from "fs/promises";
import * as path from "path";
import { createGunzip } from "zlib";
import { extract } from "tar";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Skill 版本清单
 */
interface SkillManifest {
  /** skills 版本映射 */
  skills: Record<string, string>;
}

/**
 * 更新项
 */
interface UpdateItem {
  name: string;
  version: string;
  isNew: boolean;
}

/** 远程文件基础 URL */
const REMOTE_BASE_URL = "https://open-im.api.weibo.com/skills_release/";

/** 远程 manifest URL，基于 REMOTE_BASE_URL 拼接 */
const REMOTE_MANIFEST_URL = `${REMOTE_BASE_URL}manifest.json`;

/** skills 目录路径 */
const SKILLS_DIR = path.join(__dirname, "..", "skills");

/** 本地 manifest 文件路径 */
const LOCAL_MANIFEST_PATH = path.join(SKILLS_DIR, "manifest.json");

/** 检查间隔（毫秒），1 小时 */
const CHECK_INTERVAL_MS = 3600_000;

/** 是否启用自动更新 */
const AUTO_UPDATE_ENABLED = true;

/** 网络请求超时（毫秒），10 秒 */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * 带超时的 fetch
 */
async function fetchWithTimeout(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`请求超时 (${timeoutMs}ms): ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** 上次检查时间戳 */
let lastCheckTime = 0;

/** 是否正在更新中 */
let isUpdating = false;

/**
 * 触发 skill 更新检查（如果需要）
 * 由心跳调用，通过时间戳节流控制检查频率
 * 异步执行，不阻塞调用方
 */
export function triggerSkillUpdateIfNeeded(): void {
  if (!AUTO_UPDATE_ENABLED) {
    return;
  }

  // 如果正在更新中，跳过
  if (isUpdating) {
    return;
  }

  const now = Date.now();
  // 未到检查时间，跳过
  if (now - lastCheckTime < CHECK_INTERVAL_MS) {
    return;
  }

  lastCheckTime = now;

  // 异步执行，不等待结果
  checkAndUpdateSkills().catch((err) => {
    console.warn("[Weibo Skill Updater] 自动更新失败:", err.message);
  });
}

/**
 * 检查并更新 skills
 */
async function checkAndUpdateSkills(): Promise<void> {
  if (isUpdating) {
    return;
  }

  isUpdating = true;
  console.log("[Weibo Skill Updater] 检查 skills 更新...");

  try {
    // 1. 获取远程 manifest
    const remoteManifest = await fetchRemoteManifest();

    // 2. 获取本地 manifest
    const localManifest = await loadLocalManifest();

    // 3. 计算需要更新的 skills
    const updates = calculateUpdates(localManifest, remoteManifest);

    if (updates.length === 0) {
      console.log("[Weibo Skill Updater] 所有 skills 已是最新版本");
      return;
    }

    // 4. 下载并解压
    console.log(`[Weibo Skill Updater] 发现 ${updates.length} 个更新`);

    let allSucceeded = true;

    for (const { name, version, isNew } of updates) {
      const action = isNew ? "新增" : "更新";
      console.log(`[Weibo Skill Updater] ${action}: ${name} → ${version}`);
      try {
        await downloadAndExtractSkill(name, version);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Weibo Skill Updater] ${name} 更新失败: ${message}`);
        allSucceeded = false;
      }
    }

    // 5. 只有全部成功才保存本地 manifest
    if (allSucceeded) {
      await saveLocalManifest(remoteManifest);
      console.log("[Weibo Skill Updater] 更新完成");
    } else {
      console.warn("[Weibo Skill Updater] 部分更新失败，manifest 未更新，下次将重试");
    }
  } finally {
    isUpdating = false;
  }
}

/**
 * 计算需要更新的 skills
 */
function calculateUpdates(
  local: SkillManifest | null,
  remote: SkillManifest
): UpdateItem[] {
  const updates: UpdateItem[] = [];
  const localSkills = local?.skills || {};

  for (const [name, remoteVersion] of Object.entries(remote.skills)) {
    const localVersion = localSkills[name];

    if (!localVersion) {
      // 新增
      updates.push({ name, version: remoteVersion, isNew: true });
    } else if (compareVersions(remoteVersion, localVersion) > 0) {
      // 更新
      updates.push({ name, version: remoteVersion, isNew: false });
    }
  }

  return updates;
}

/**
 * 下载并解压 skill
 * 先解压到临时目录，成功后再替换旧目录，确保更新的原子性
 */
async function downloadAndExtractSkill(
  skillName: string,
  version: string
): Promise<void> {
  const archiveUrl = `${REMOTE_BASE_URL}${skillName}-${version}.tar.gz`;
  const skillDir = path.join(SKILLS_DIR, skillName);
  const tempDir = path.join(SKILLS_DIR, `.${skillName}-temp-${Date.now()}`);

  // 下载（带超时）
  const response = await fetchWithTimeout(archiveUrl);
  if (!response.ok) {
    throw new Error(`下载失败: ${archiveUrl} (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // 检查下载的文件不为空
  if (buffer.length === 0) {
    throw new Error(`下载的文件为空: ${archiveUrl}`);
  }

  // 创建临时目录
  await fs.mkdir(tempDir, { recursive: true });

  try {
    // 解压到临时目录
    // tar 包内已包含目录结构（如 weibo-token/SKILL.md）
    const readable = Readable.from(buffer);
    const gunzip = createGunzip();
    const extractor = extract({ cwd: tempDir, strip: 0 });

    await pipeline(readable, gunzip, extractor);

    // 验证解压结果：检查 skillName 子目录是否存在
    const extractedDir = path.join(tempDir, skillName);
    try {
      await fs.access(extractedDir);
    } catch {
      throw new Error(`解压后未找到 ${skillName} 目录`);
    }

    // 解压成功，删除旧目录
    await fs.rm(skillDir, { recursive: true, force: true });

    // 移动新目录到目标位置
    await fs.rename(extractedDir, skillDir);

    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true });

    console.log(`[Weibo Skill Updater] ${skillName} 已更新到 ${version}`);
  } catch (err) {
    // 清理临时目录
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

/**
 * 比较版本号
 * @returns 正数表示 a > b，负数表示 a < b，0 表示相等
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);

  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/**
 * 获取远程 manifest
 */
async function fetchRemoteManifest(): Promise<SkillManifest> {
  const response = await fetchWithTimeout(REMOTE_MANIFEST_URL);
  if (!response.ok) {
    throw new Error(`获取 manifest 失败: ${response.status}`);
  }
  return response.json() as Promise<SkillManifest>;
}

/**
 * 加载本地 manifest
 */
async function loadLocalManifest(): Promise<SkillManifest | null> {
  try {
    const content = await fs.readFile(LOCAL_MANIFEST_PATH, "utf-8");
    return JSON.parse(content) as SkillManifest;
  } catch {
    return null;
  }
}

/**
 * 保存本地 manifest
 */
async function saveLocalManifest(manifest: SkillManifest): Promise<void> {
  await fs.writeFile(LOCAL_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}
