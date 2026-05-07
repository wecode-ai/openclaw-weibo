#!/usr/bin/env node

/**
 * Independent Skills 打包脚本
 *
 * 完成以下任务：
 * 1. 打包所有 skills_independent 中的 skill 到 skills_independent_release/ 目录
 *
 * 用法:
 *   node scripts/pack-independent-skills.js                # 打包所有 skills
 *   node scripts/pack-independent-skills.js weibo-skill    # 打包指定 skill
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import archiver from "archiver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILLS_DIR = path.join(__dirname, "..", "skills_independent");
const OUTPUT_DIR = path.join(__dirname, "..", "skills_independent_release");

/**
 * 获取所有 skill 目录
 */
function getSkillDirs() {
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => {
      // 排除隐藏目录和非 skill 目录
      if (name.startsWith(".")) return false;
      const skillMdPath = path.join(SKILLS_DIR, name, "SKILL.md");
      return fs.existsSync(skillMdPath);
    });
}

/**
 * 打包单个 skill
 */
async function packSkill(skillName) {
  const skillDir = path.join(SKILLS_DIR, skillName);

  if (!fs.existsSync(skillDir)) {
    console.error(`[ERROR] Skill 目录不存在: ${skillName}`);
    return false;
  }

  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputFile = path.join(OUTPUT_DIR, `${skillName}.zip`);

  // 使用 archiver 创建 zip 文件
  // 将所有文件放在 skillName 目录下
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputFile);
    const archive = archiver("zip", { zlib: { level: 6 } });

    output.on("close", resolve);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(skillDir, skillName);
    archive.finalize();
  });

  console.log(`[OK] ${skillName}.zip`);

  return true;
}

/**
 * 清空输出目录
 */
function cleanOutputDir() {
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    console.log(`[OK] 已清空输出目录: ${OUTPUT_DIR}\n`);
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  console.log("=== Independent Skills 打包工具 ===\n");

  let skillsToPack;

  if (args.length > 0) {
    // 打包指定的 skills
    skillsToPack = args;
  } else {
    // 打包所有 skills
    skillsToPack = getSkillDirs();
  }

  if (skillsToPack.length === 0) {
    console.log("没有找到需要打包的 skills");
    return;
  }

  // 清空输出目录
  cleanOutputDir();

  console.log(`准备打包 ${skillsToPack.length} 个 skills:\n`);

  // 打包所有 skills
  let successCount = 0;
  for (const skillName of skillsToPack) {
    const ok = await packSkill(skillName);
    if (ok) successCount++;
  }

  console.log(`\n打包完成: ${successCount}/${skillsToPack.length}`);
  console.log(`\n输出目录: ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error("打包失败:", err);
  process.exit(1);
});
