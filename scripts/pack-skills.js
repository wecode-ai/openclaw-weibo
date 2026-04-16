#!/usr/bin/env node

/**
 * Skills 打包脚本
 *
 * 完成以下任务：
 * 1. 打包所有 skill 到 skills_release/ 目录
 * 2. 生成 manifest.json 到 skills/ 目录（本地版本清单）
 * 3. 生成 manifest.json 到 skills_release/ 目录（远程发布用）
 *
 * 用法:
 *   node scripts/pack-skills.js              # 打包所有 skills
 *   node scripts/pack-skills.js weibo-crowd  # 打包指定 skill
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as tar from "tar";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILLS_DIR = path.join(__dirname, "..", "skills");
const OUTPUT_DIR = path.join(__dirname, "..", "skills_release");

/**
 * 从 SKILL.md 的 frontmatter 中读取 metadata.version
 */
function readSkillVersion(skillDir) {
  const skillMdPath = path.join(skillDir, "SKILL.md");

  if (!fs.existsSync(skillMdPath)) {
    return null;
  }

  const content = fs.readFileSync(skillMdPath, "utf-8");

  // 解析 frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return null;
  }

  const frontmatter = frontmatterMatch[1];

  // 解析 metadata.version
  // 支持格式:
  // metadata:
  //   version: "1.0.0"
  const metadataMatch = frontmatter.match(/^metadata:\s*\n((?:\s+.+\n?)*)/m);
  if (!metadataMatch) {
    return null;
  }

  const metadataContent = metadataMatch[1];
  const versionMatch = metadataContent.match(/^\s+version:\s*["']?([^"'\n]+)["']?/m);

  return versionMatch ? versionMatch[1].trim() : null;
}

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
    return null;
  }

  const version = readSkillVersion(skillDir);
  if (!version) {
    console.error(`[ERROR] 无法读取 ${skillName} 的版本号，请在 SKILL.md 的 metadata.version 中添加版本信息`);
    return null;
  }

  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputFile = path.join(OUTPUT_DIR, `${skillName}-${version}.tar.gz`);

  // 获取 skill 目录下的所有文件（相对路径，带 skill 名称前缀）
  const files = [];
  function collectFiles(dir, prefix = "") {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        collectFiles(fullPath, relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }
  collectFiles(skillDir);

  // 使用 tar.create 创建 tar.gz 文件
  // 使用 prefix 选项将所有文件放在 skillName 目录下
  await tar.create(
    {
      gzip: true,
      file: outputFile,
      cwd: skillDir,
      prefix: skillName,
    },
    files
  );

  console.log(`[OK] ${skillName}-${version}.tar.gz`);

  return { name: skillName, version };
}

/**
 * 生成 manifest.json
 */
function generateManifest(skills) {
  return {
    skills: Object.fromEntries(skills.map(s => [s.name, s.version])),
  };
}

/**
 * 保存 manifest.json 到指定路径
 */
function saveManifest(manifest, outputPath) {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`[OK] manifest.json -> ${outputPath}`);
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
 * 将 skills/ 目录下的 .md 文件复制到 skills_release/（不加入 manifest.json）
 */
function copySkillsMdFiles() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  const mdFiles = entries
    .filter(entry => entry.isFile() && entry.name.endsWith(".md"))
    .map(entry => entry.name);

  if (mdFiles.length === 0) {
    return;
  }

  console.log("\n复制 .md 文件到输出目录...\n");
  for (const mdFile of mdFiles) {
    const src = path.join(SKILLS_DIR, mdFile);
    const dest = path.join(OUTPUT_DIR, mdFile);
    fs.copyFileSync(src, dest);
    console.log(`[OK] ${mdFile} -> skills_release/${mdFile}`);
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  console.log("=== Skills 打包工具 ===\n");

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

  // 1. 打包所有 skills
  const results = [];
  for (const skillName of skillsToPack) {
    const result = await packSkill(skillName);
    if (result) {
      results.push(result);
    }
  }

  console.log(`\n打包完成: ${results.length}/${skillsToPack.length}`);

  if (results.length === 0) {
    console.error("没有成功打包的 skills，跳过生成 manifest.json");
    return;
  }

  // 2. 生成 manifest.json
  console.log("\n生成 manifest.json...\n");
  const manifest = generateManifest(results);

  // 保存到 skills/ 目录（本地版本清单）
  saveManifest(manifest, path.join(SKILLS_DIR, "manifest.json"));

  // 保存到 skills_release/ 目录（远程发布用）
  saveManifest(manifest, path.join(OUTPUT_DIR, "manifest.json"));

  // 3. 复制 skills/ 目录下的 .md 文件到 skills_release/
  copySkillsMdFiles();

  // 输出版本信息
  console.log("\n版本信息:");
  for (const { name, version } of results) {
    console.log(`  ${name}: ${version}`);
  }

  console.log(`\n输出目录: ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error("打包失败:", err);
  process.exit(1);
});
