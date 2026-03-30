#!/usr/bin/env node

/**
 * 自动检测 openclaw 版本并安装/更新对应版本的 weibo-openclaw-plugin
 *
 * 用法：
 *   npx @wecode-ai/weibo-openclaw-plugin          # 安装插件
 *   npx @wecode-ai/weibo-openclaw-plugin update   # 更新插件
 *
 * 版本兼容性：
 * - OpenClaw >= 2026.3.23: 安装最新版本 (2.1.0+)
 * - OpenClaw < 2026.3.23: 安装 2.0.1 版本
 */

import { execSync, spawn } from 'child_process';

const PACKAGE_NAME = '@wecode-ai/weibo-openclaw-plugin';
const PLUGIN_NAME = 'weibo-openclaw-plugin';
const VERSION_THRESHOLD = '2026.3.23';
const LEGACY_VERSION = '2.0.1';

/**
 * 比较两个版本号
 * @param {string} v1
 * @param {string} v2
 * @returns {number} -1 if v1 < v2, 0 if v1 == v2, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

/**
 * 获取 openclaw 版本
 * @returns {string|null}
 */
function getOpenclawVersion() {
  try {
    const output = execSync('openclaw --version', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    // 输出格式可能是 "openclaw 2026.3.23" 或 "2026.3.23"
    const match = output.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * 执行 openclaw plugins 命令
 * @param {string} action - 'install' 或 'update'
 * @param {string} packageSpec - 包名或包名@版本
 */
function runPluginCommand(action, packageSpec) {
  const actionText = action === 'install' ? '安装' : '更新';
  const actionEmoji = action === 'install' ? '📦' : '🔄';

  console.log(`\n${actionEmoji} 正在${actionText} ${packageSpec}...\n`);

  const args = action === 'update'
    ? ['plugins', 'update', PLUGIN_NAME]
    : ['plugins', 'install', packageSpec];

  const child = spawn('openclaw', args, {
    stdio: 'inherit',
    shell: true
  });

  child.on('close', (code) => {
    if (code === 0) {
      console.log(`\n✅ ${packageSpec} ${actionText}成功！`);
    } else {
      console.error(`\n❌ ${actionText}失败，退出码: ${code}`);
      process.exit(code);
    }
  });

  child.on('error', (err) => {
    console.error(`\n❌ ${actionText}失败: ${err.message}`);
    process.exit(1);
  });
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
微博 OpenClaw 插件安装工具

用法：
  npx ${PACKAGE_NAME}              安装插件（自动检测版本）
  npx ${PACKAGE_NAME} update       更新插件到最新兼容版本
  npx ${PACKAGE_NAME} help         显示此帮助信息

版本兼容性：
  OpenClaw >= ${VERSION_THRESHOLD}: 安装最新版本的插件
  OpenClaw <  ${VERSION_THRESHOLD}: 安装 ${LEGACY_VERSION} 版本的插件
`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  // 处理帮助命令
  if (command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  // 检测 OpenClaw 版本
  console.log('🔍 检测 OpenClaw 版本...');

  const version = getOpenclawVersion();

  if (!version) {
    console.error('❌ 未检测到 OpenClaw，请先安装 OpenClaw。');
    console.error('   安装方法: npm install -g openclaw');
    process.exit(1);
  }

  console.log(`   检测到 OpenClaw 版本: ${version}`);

  const isNewVersion = compareVersions(version, VERSION_THRESHOLD) >= 0;

  // 处理 update 命令
  if (command === 'update') {
    if (isNewVersion) {
      console.log(`   版本 >= ${VERSION_THRESHOLD}，将更新到最新版本的插件`);
      runPluginCommand('update', PACKAGE_NAME);
    } else {
      console.log(`   版本 < ${VERSION_THRESHOLD}，将更新到 ${LEGACY_VERSION} 版本的插件`);
      // 对于旧版本，使用 install 命令来"更新"到指定版本
      runPluginCommand('install', `${PACKAGE_NAME}@${LEGACY_VERSION}`);
    }
    return;
  }

  // 默认：安装命令
  if (isNewVersion) {
    console.log(`   版本 >= ${VERSION_THRESHOLD}，将安装最新版本的插件`);
    runPluginCommand('install', PACKAGE_NAME);
  } else {
    console.log(`   版本 < ${VERSION_THRESHOLD}，将安装 ${LEGACY_VERSION} 版本的插件`);
    runPluginCommand('install', `${PACKAGE_NAME}@${LEGACY_VERSION}`);
  }
}

main();
