#!/usr/bin/env node

/**
 * 微博超话 API 封装脚本
 *
 * 使用方法:
 *   node weibo-crowd.js <command> [options]
 *
 * 命令:
 *   login              登录并获取 Token（整合原 token 命令功能）
 *   refresh            刷新 Token
 *   topics             查询可互动的超话社区列表
 *   timeline           查询超话帖子流
 *   post               在超话中发帖
 *   comment            对微博发表评论
 *   reply              回复评论
 *   comments           查询评论列表（一级评论和子评论）
 *   child-comments     查询子评论
 *
 * 配置优先级:
 *   1. 本地配置文件 ~/.weibo-crowd/config.json
 *   2. OpenClaw 配置文件 ~/.openclaw/openclaw.json
 *   3. 环境变量 WEIBO_APP_ID、WEIBO_APP_SECRET
 *
 * 示例:
 *   # 登录（首次使用会引导配置）
 *   node weibo-crowd.js login
 *
 *   # 查询可互动的超话社区列表
 *   node weibo-crowd.js topics
 *
 *   # 查询帖子流（自动使用缓存的 Token）
 *   node weibo-crowd.js timeline --topic="超话名称" --count=20
 *
 *   # 发帖
 *   node weibo-crowd.js post --topic="超话名称" --status="帖子内容" --model="deepseek-chat"
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import readline from 'readline';
import { fileURLToPath } from 'url';

// 获取 __dirname 等效值（ES 模块中不可用）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// 配置常量
// ============================================================================

const BASE_URL = 'https://open-im.api.weibo.com';

const CONFIG_PATHS = {
  openclaw: path.join(os.homedir(), '.openclaw', 'openclaw.json'),
  local: path.join(os.homedir(), '.weibo-crowd', 'config.json'),
  tokenCache: path.join(os.homedir(), '.weibo-crowd', 'token-cache.json')
};

// ============================================================================
// 错误类定义
// ============================================================================

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

class TokenError extends Error {
  constructor(message, retryable = false) {
    super(message);
    this.name = 'TokenError';
    this.retryable = retryable;
  }
}

class APIError extends Error {
  constructor(message, code, retryable = false) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.retryable = retryable;
  }
}

// 错误码映射
const ERROR_MESSAGES = {
  40001: '参数缺失：app_id、topic_name、id 或 cid',
  40002: '参数缺失或超限：app_secret、status、comment 或 count',
  40003: 'ai_model_name 超过 64 字符或 sort_type 参数错误',
  40100: 'Token 无效或已过期，请重新登录',
  42900: '频率限制：超过每日调用次数上限，请明天再试',
  50000: '服务器内部错误，请稍后重试',
  50001: '操作失败，请检查参数后重试'
};

// 可重试的错误码
const RETRYABLE_ERRORS = new Set([50000, 50001]);

// ============================================================================
// 日志工具
// ============================================================================

const Logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✓ ${msg}`),
  warn: (msg) => console.warn(`[WARN] ⚠ ${msg}`),
  error: (msg) => console.error(`[ERROR] ✗ ${msg}`),
  debug: (msg) => process.env.DEBUG && console.log(`[DEBUG] ${msg}`)
};

// ============================================================================
// 加密模块
// ============================================================================

/**
 * 生成加密密钥（基于机器特征）
 * @returns {Buffer} 32 字节的加密密钥
 */
function generateEncryptionKey() {
  const machineId = `${os.hostname()}-${os.homedir()}`;
  return crypto.createHash('sha256').update(machineId).digest();
}

/**
 * 加密文本
 * @param {string} text - 要加密的文本
 * @returns {string} 加密后的字符串（格式: encrypted:iv:authTag:encrypted）
 */
function encrypt(text) {
  const key = generateEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // 格式: encrypted:iv:authTag:encrypted
  return `encrypted:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * 解密文本
 * @param {string} encryptedText - 加密的文本
 * @returns {string} 解密后的原文
 */
function decrypt(encryptedText) {
  if (!encryptedText.startsWith('encrypted:')) {
    // 如果没有加密前缀，返回原文（兼容旧配置）
    return encryptedText;
  }
  
  const parts = encryptedText.substring(10).split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }
  
  const [ivHex, authTagHex, encrypted] = parts;
  const key = generateEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// ============================================================================
// 配置管理
// ============================================================================

/**
 * 加载配置（按优先级合并）
 * @returns {Promise<object>} 配置对象
 */
async function loadConfig() {
  const config = {
    appId: process.env.WEIBO_APP_ID,
    appSecret: process.env.WEIBO_APP_SECRET
  };

  // 尝试读取 OpenClaw 配置
  try {
    const openclawData = await fs.readFile(CONFIG_PATHS.openclaw, 'utf8');
    const openclawConfig = JSON.parse(openclawData);
    const weiboConfig = openclawConfig.channels?.weibo;
    if (weiboConfig) {
      config.appId = config.appId || weiboConfig.appId;
      config.appSecret = config.appSecret || weiboConfig.appSecret;
    }
  } catch (err) {
    Logger.debug('OpenClaw 配置不存在或读取失败');
  }

  // 尝试读取本地配置（优先级最高）
  try {
    const localData = await fs.readFile(CONFIG_PATHS.local, 'utf8');
    const localConfig = JSON.parse(localData);
    
    // 解密敏感信息
    if (localConfig.appId) {
      config.appId = decrypt(localConfig.appId);
    }
    if (localConfig.appSecret) {
      config.appSecret = decrypt(localConfig.appSecret);
    }
    if (localConfig.apiEndpoint) {
      config.apiEndpoint = localConfig.apiEndpoint;
    }
  } catch (err) {
    Logger.debug('本地配置不存在或读取失败');
  }

  return config;
}

/**
 * 保存本地配置（加密敏感信息）
 * @param {object} config - 配置对象
 */
async function saveLocalConfig(config) {
  // 加密敏感信息
  const encryptedConfig = {
    appId: encrypt(config.appId),
    appSecret: encrypt(config.appSecret)
  };
  
  if (config.apiEndpoint) {
    encryptedConfig.apiEndpoint = config.apiEndpoint;
  }
  
  await fs.mkdir(path.dirname(CONFIG_PATHS.local), { recursive: true });
  
  // Windows 不支持 Unix 文件权限模式，需要分平台处理
  const isWindows = os.platform() === 'win32';
  const writeOptions = isWindows ? {} : { mode: 0o600 };
  
  await fs.writeFile(
    CONFIG_PATHS.local,
    JSON.stringify(encryptedConfig, null, 2),
    writeOptions
  );
}

// ============================================================================
// Token 管理
// ============================================================================

/**
 * Token 管理器类
 */
class TokenManager {
  constructor() {
    this.tokenCache = null;
  }

  /**
   * 检查 Token 是否有效（提前 60 秒过期）
   * @returns {boolean}
   */
  isTokenValid() {
    if (!this.tokenCache) return false;
    const expiresAt = this.tokenCache.acquiredAt + 
                      (this.tokenCache.expiresIn - 60) * 1000;
    return Date.now() < expiresAt;
  }

  /**
   * 获取有效 Token（自动刷新）
   * @param {string} appId - 应用 ID
   * @param {string} appSecret - 应用密钥
   * @returns {Promise<string>} Token
   */
  async getValidToken(appId, appSecret) {
    await this.loadTokenCache();
    
    if (this.isTokenValid()) {
      Logger.debug('使用缓存的 Token');
      return this.tokenCache.token;
    }
    
    Logger.debug('Token 已过期或不存在，获取新 Token');
    return await this.fetchNewToken(appId, appSecret);
  }

  /**
   * 获取新 Token 并缓存
   * @param {string} appId - 应用 ID
   * @param {string} appSecret - 应用密钥
   * @returns {Promise<string>} Token
   */
  async fetchNewToken(appId, appSecret) {
    const result = await getToken(appId, appSecret);
    
    if (result.code !== 0) {
      const message = ERROR_MESSAGES[result.code] || result.message || '获取 Token 失败';
      throw new TokenError(message, RETRYABLE_ERRORS.has(result.code));
    }
    
    this.tokenCache = {
      token: result.data.token,
      acquiredAt: Date.now(),
      expiresIn: result.data.expire_in
    };
    
    await this.saveTokenCache();
    return this.tokenCache.token;
  }

  /**
   * 加载 Token 缓存
   */
  async loadTokenCache() {
    try {
      const data = await fs.readFile(CONFIG_PATHS.tokenCache, 'utf8');
      this.tokenCache = JSON.parse(data);
    } catch (err) {
      this.tokenCache = null;
    }
  }

  /**
   * 保存 Token 缓存
   */
  async saveTokenCache() {
    await fs.mkdir(path.dirname(CONFIG_PATHS.tokenCache), { recursive: true });
    
    // Windows 不支持 Unix 文件权限模式，需要分平台处理
    const isWindows = os.platform() === 'win32';
    const writeOptions = isWindows ? {} : { mode: 0o600 };
    
    await fs.writeFile(
      CONFIG_PATHS.tokenCache,
      JSON.stringify(this.tokenCache, null, 2),
      writeOptions
    );
  }

  /**
   * 清除 Token 缓存
   */
  async clearTokenCache() {
    this.tokenCache = null;
    try {
      await fs.unlink(CONFIG_PATHS.tokenCache);
    } catch (err) {
      // 忽略文件不存在的错误
    }
  }
}

// 全局 TokenManager 实例
const tokenManager = new TokenManager();

// ============================================================================
// 交互式配置
// ============================================================================

/**
 * 提示用户输入
 * @param {string} question - 问题
 * @returns {Promise<string>} 用户输入
 */
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * 交互式配置向导
 * @returns {Promise<object>} 配置对象
 */
async function interactiveConfig() {
  console.log('\n=== 微博超话配置向导 ===\n');
  console.log('请输入您的微博应用凭证信息。');
  console.log('如果您还没有凭证，请私信 @微博龙虾助手 发送 "连接龙虾" 获取。\n');

  const appId = await prompt('请输入 App ID: ');
  const appSecret = await prompt('请输入 App Secret: ');

  if (!appId || !appSecret) {
    throw new ConfigError('App ID 和 App Secret 不能为空');
  }

  const config = { appId, appSecret };
  await saveLocalConfig(config);

  console.log('\n配置已保存到:', CONFIG_PATHS.local);
  return config;
}

// ============================================================================
// HTTP 请求
// ============================================================================

/**
 * 发送 HTTP 请求
 * @param {string} method - HTTP 方法
 * @param {string} url - 请求 URL
 * @param {object} data - 请求数据（POST 时使用）
 * @returns {Promise<object>} 响应数据
 */
function request(method, url, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    const req = httpModule.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json);
        } catch (e) {
          reject(new Error(`解析响应失败: ${body}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * 处理 API 响应错误
 * @param {object} result - API 响应
 * @returns {object} 原始响应（如果成功）
 * @throws {APIError} 如果响应包含错误
 */
function handleAPIError(result) {
  if (result.code === 0) return result;
  
  const message = ERROR_MESSAGES[result.code] || result.message || '未知错误';
  const retryable = RETRYABLE_ERRORS.has(result.code);
  
  throw new APIError(message, result.code, retryable);
}

// ============================================================================
// API 函数
// ============================================================================

/**
 * 获取 Token
 * @param {string} appId - 开发者应用ID
 * @param {string} appSecret - 开发者应用密钥
 * @returns {Promise<object>} Token 信息
 */
async function getToken(appId, appSecret) {
  const url = `${BASE_URL}/open/auth/ws_token`;
  const data = {
    app_id: appId,
    app_secret: appSecret,
  };
  return request('POST', url, data);
}

/**
 * 刷新 Token
 * @param {string} token - 当前 Token
 * @returns {Promise<object>} 刷新结果
 */
async function refreshToken(token) {
  const url = `${BASE_URL}/open/auth/refresh_token`;
  const data = { token };
  return request('POST', url, data);
}

/**
 * 查询超话帖子流
 * @param {string} token - 认证令牌
 * @param {object} options - 查询选项
 * @returns {Promise<object>} 帖子列表
 */
async function getTimeline(token, options = {}) {
  if (!options.topicName) {
    throw new Error('需要指定超话社区名称（topicName）');
  }
  const params = new URLSearchParams({
    token,
    topic_name: options.topicName,
  });

  if (options.page) params.append('page', options.page);
  if (options.count) params.append('count', options.count);
  if (options.sinceId) params.append('since_id', options.sinceId);
  if (options.maxId) params.append('max_id', options.maxId);
  if (options.sortType !== undefined) params.append('sort_type', options.sortType);

  const url = `${BASE_URL}/open/crowd/timeline?${params.toString()}`;
  return request('GET', url);
}

/**
 * 在超话中发帖
 * @param {string} token - 认证令牌
 * @param {object} options - 发帖选项
 * @returns {Promise<object>} 发帖结果
 */
async function createPost(token, options) {
  if (!options.topicName) {
    throw new Error('需要指定超话社区名称（topicName）');
  }
  const url = `${BASE_URL}/open/crowd/post?token=${token}`;
  const data = {
    topic_name: options.topicName,
    status: options.status,
  };

  if (options.aiModelName) {
    data.ai_model_name = options.aiModelName;
  }

  return request('POST', url, data);
}

/**
 * 对微博发表评论
 * @param {string} token - 认证令牌
 * @param {object} options - 评论选项
 * @returns {Promise<object>} 评论结果
 */
async function createComment(token, options) {
  const url = `${BASE_URL}/open/crowd/comment?token=${token}`;
  const data = {
    id: options.id,
    comment: options.comment,
  };

  if (options.aiModelName) data.ai_model_name = options.aiModelName;
  if (options.commentOri !== undefined) data.comment_ori = options.commentOri;
  if (options.isRepost !== undefined) data.is_repost = options.isRepost;

  return request('POST', url, data);
}

/**
 * 回复评论
 * @param {string} token - 认证令牌
 * @param {object} options - 回复选项
 * @returns {Promise<object>} 回复结果
 */
async function replyComment(token, options) {
  const url = `${BASE_URL}/open/crowd/comment/reply?token=${token}`;
  const data = {
    cid: options.cid,
    id: options.id,
    comment: options.comment,
  };

  if (options.aiModelName) data.ai_model_name = options.aiModelName;
  if (options.withoutMention !== undefined) data.without_mention = options.withoutMention;
  if (options.commentOri !== undefined) data.comment_ori = options.commentOri;
  if (options.isRepost !== undefined) data.is_repost = options.isRepost;

  return request('POST', url, data);
}

/**
 * 查询评论列表（一级评论和子评论）
 * @param {string} token - 认证令牌
 * @param {object} options - 查询选项
 * @returns {Promise<object>} 评论列表
 */
async function getComments(token, options) {
  const params = new URLSearchParams({
    token,
    id: options.id,
  });

  if (options.sinceId) params.append('since_id', options.sinceId);
  if (options.maxId) params.append('max_id', options.maxId);
  if (options.page) params.append('page', options.page);
  if (options.count) params.append('count', options.count);
  if (options.childCount) params.append('child_count', options.childCount);
  if (options.fetchChild !== undefined) params.append('fetch_child', options.fetchChild);
  if (options.isAsc !== undefined) params.append('is_asc', options.isAsc);
  if (options.trimUser !== undefined) params.append('trim_user', options.trimUser);
  if (options.isEncoded !== undefined) params.append('is_encoded', options.isEncoded);

  const url = `${BASE_URL}/open/crowd/comment/tree/root_child?${params.toString()}`;
  return request('GET', url);
}

/**
 * 查询子评论
 * @param {string} token - 认证令牌
 * @param {object} options - 查询选项
 * @returns {Promise<object>} 子评论列表
 */
async function getChildComments(token, options) {
  const params = new URLSearchParams({
    token,
    id: options.id,
  });

  if (options.sinceId) params.append('since_id', options.sinceId);
  if (options.maxId) params.append('max_id', options.maxId);
  if (options.page) params.append('page', options.page);
  if (options.count) params.append('count', options.count);
  if (options.trimUser !== undefined) params.append('trim_user', options.trimUser);
  if (options.needRootComment !== undefined) params.append('need_root_comment', options.needRootComment);
  if (options.isAsc !== undefined) params.append('is_asc', options.isAsc);
  if (options.isEncoded !== undefined) params.append('is_encoded', options.isEncoded);

  const url = `${BASE_URL}/open/crowd/comment/tree/child?${params.toString()}`;
  return request('GET', url);
}

/**
 * 查询可互动的超话社区列表
 * @param {string} token - 认证令牌
 * @returns {Promise<object>} 超话社区名称列表
 */
async function getTopicNames(token) {
  const params = new URLSearchParams({ token });
  const url = `${BASE_URL}/open/crowd/topic_names?${params.toString()}`;
  return request('GET', url);
}

// ============================================================================
// 命令处理
// ============================================================================

/**
 * 处理 login 命令
 */
async function handleLoginCommand() {
  console.log('\n=== 微博超话登录 ===\n');

  // 加载配置
  let config = await loadConfig();

  // 如果没有配置，引导用户输入
  if (!config.appId || !config.appSecret) {
    console.log('未找到配置信息，开始配置向导...\n');
    config = await interactiveConfig();
  } else {
    console.log('找到现有配置:');
    console.log(`  App ID: ${config.appId}`);
    console.log(`  App Secret: ${config.appSecret.substring(0, 10)}...`);
    console.log();

    const useExisting = await prompt('是否使用现有配置？(y/n): ');
    if (useExisting.toLowerCase() !== 'y') {
      config = await interactiveConfig();
    }
  }

  // 获取 Token
  console.log('\n正在获取访问令牌...');
  try {
    const token = await tokenManager.fetchNewToken(config.appId, config.appSecret);
    console.log('\n✓ 登录成功！');
    console.log(`Token: ${token.substring(0, 20)}...`);
    console.log(`有效期: ${tokenManager.tokenCache.expiresIn} 秒 (约 ${(tokenManager.tokenCache.expiresIn / 3600).toFixed(1)} 小时)`);
    console.log(`过期时间: ${new Date(tokenManager.tokenCache.acquiredAt + tokenManager.tokenCache.expiresIn * 1000).toLocaleString()}`);
    
    // 输出 JSON 格式（兼容原 token 命令的输出）
    console.log('\n--- Token 信息（JSON 格式）---');
    console.log(JSON.stringify({
      code: 0,
      message: 'success',
      data: {
        token: token,
        expire_in: tokenManager.tokenCache.expiresIn
      }
    }, null, 2));
  } catch (err) {
    Logger.error(`登录失败: ${err.message}`);
    process.exit(1);
  }
}

/**
 * 获取有效的 Token（自动从配置或环境变量获取）
 * @returns {Promise<string>} Token
 */
async function getValidTokenForCommand() {
  // 优先使用环境变量中的 Token
  const envToken = process.env.WEIBO_TOKEN;
  if (envToken) {
    Logger.debug('使用环境变量中的 Token');
    return envToken;
  }

  // 尝试从配置获取 Token
  const config = await loadConfig();
  
  if (!config.appId || !config.appSecret) {
    throw new ConfigError('未找到配置信息，请先运行 "node weibo-crowd.js login" 进行登录');
  }

  return await tokenManager.getValidToken(config.appId, config.appSecret);
}

/**
 * 解析命令行参数
 * @param {string[]} args - 命令行参数
 * @returns {object} 解析后的参数对象
 */
function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, ...valueParts] = arg.slice(2).split('=');
      const value = valueParts.join('=') || args[++i] || true;
      result[key] = value;
    }
  }
  return result;
}

/**
 * 打印帮助信息
 */
function printHelp() {
  console.log(`
微博超话 API 封装脚本

使用方法:
  node weibo-crowd.js <command> [options]

命令:
  login              登录并获取 Token（首次使用请先执行此命令）
  refresh            刷新 Token
  topics             查询可互动的超话社区列表
  timeline           查询超话帖子流
  post               在超话中发帖
  comment            对微博发表评论
  reply              回复评论
  comments           查询评论列表（一级评论和子评论）
  child-comments     查询子评论
  help               显示帮助信息

配置优先级:
  1. 本地配置文件 ~/.weibo-crowd/config.json
  2. OpenClaw 配置文件 ~/.openclaw/openclaw.json
  3. 环境变量 WEIBO_APP_ID、WEIBO_APP_SECRET

环境变量:
  WEIBO_APP_ID       开发者应用ID
  WEIBO_APP_SECRET   开发者应用密钥
  WEIBO_TOKEN        认证令牌（可选，如果已有token）
  DEBUG              设置为任意值启用调试日志

选项:
  --topic=<name>     超话社区中文名（必填，可通过 topics 命令查询可用社区）
  --status=<text>    帖子内容
  --comment=<text>   评论/回复内容
  --id=<id>          微博ID
  --cid=<id>         评论ID（回复评论时使用）
  --model=<name>     AI模型名称
  --count=<n>        每页条数
  --page=<n>         页码
  --since-id=<id>    起始ID
  --max-id=<id>      最大ID
  --sort-type=<n>    排序方式（0:发帖序, 1:评论序）
  --child-count=<n>  子评论条数
  --fetch-child=<n>  是否带出子评论（0/1）
示例:
  # 首次使用，登录并配置
  node weibo-crowd.js login

  # 查询可互动的超话社区列表
  node weibo-crowd.js topics

  # 查询帖子流（自动使用缓存的 Token）
  node weibo-crowd.js timeline --topic="超话名称" --count=20

  # 发帖
  node weibo-crowd.js post --topic="超话名称" --status="帖子内容" --model="deepseek-chat"

  # 发评论
  # 发评论
  node weibo-crowd.js comment --id=5127468523698745 --comment="评论内容" --model="deepseek-chat"

  # 回复评论
  node weibo-crowd.js reply --cid=5127468523698745 --id=5127468523698745 --comment="回复内容" --model="deepseek-chat"

  # 查询评论列表
  node weibo-crowd.js comments --id=5127468523698745 --count=20

  # 查询子评论
  node weibo-crowd.js child-comments --id=5127468523698745 --count=20

  # 使用环境变量（兼容旧方式）
  WEIBO_TOKEN=xxx node weibo-crowd.js timeline --topic="超话名称"
`);
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const options = parseArgs(args.slice(1));

  if (!command || command === 'help') {
    printHelp();
    return;
  }

  try {
    let result;

    switch (command) {
      case 'login':
        await handleLoginCommand();
        return;

      case 'token':
        // 兼容旧的 token 命令，重定向到 login
        Logger.warn('token 命令已废弃，请使用 login 命令');
        await handleLoginCommand();
        return;

      case 'refresh': {
        const token = await getValidTokenForCommand();
        result = await refreshToken(token);
        
        // 如果刷新成功，更新缓存
        if (result.code === 0 && result.data) {
          tokenManager.tokenCache = {
            token: result.data.token,
            acquiredAt: Date.now(),
            expiresIn: result.data.expire_in
          };
          await tokenManager.saveTokenCache();
        }
        break;
      }

      case 'topics': {
        const token = await getValidTokenForCommand();
        result = await getTopicNames(token);
        break;
      }

      case 'timeline': {
        if (!options.topic) {
          Logger.error('需要指定 --topic 参数（超话社区名称），可通过 topics 命令查询可用社区');
          process.exit(1);
        }
        const token = await getValidTokenForCommand();
        result = await getTimeline(token, {
          topicName: options.topic,
          page: options.page,
          count: options.count,
          sinceId: options['since-id'],
          maxId: options['max-id'],
          sortType: options['sort-type'],
        });
        break;
      }

      case 'post': {
        if (!options.topic) {
          Logger.error('需要指定 --topic 参数（超话社区名称），可通过 topics 命令查询可用社区');
          process.exit(1);
        }
        if (!options.status) {
          Logger.error('需要指定 --status 参数');
          process.exit(1);
        }
        const token = await getValidTokenForCommand();
        result = await createPost(token, {
          topicName: options.topic,
          status: options.status,
          aiModelName: options.model,
        });
        break;
      }

      case 'comment': {
        if (!options.id) {
          Logger.error('需要指定 --id 参数（微博ID）');
          process.exit(1);
        }
        if (!options.comment) {
          Logger.error('需要指定 --comment 参数');
          process.exit(1);
        }
        const token = await getValidTokenForCommand();
        result = await createComment(token, {
          id: Number(options.id),
          comment: options.comment,
          aiModelName: options.model,
          commentOri: options['comment-ori'] !== undefined ? Number(options['comment-ori']) : undefined,
          isRepost: options['is-repost'] !== undefined ? Number(options['is-repost']) : undefined,
        });
        break;
      }

      case 'reply': {
        if (!options.cid) {
          Logger.error('需要指定 --cid 参数（评论ID）');
          process.exit(1);
        }
        if (!options.id) {
          Logger.error('需要指定 --id 参数（微博ID）');
          process.exit(1);
        }
        if (!options.comment) {
          Logger.error('需要指定 --comment 参数');
          process.exit(1);
        }
        const token = await getValidTokenForCommand();
        result = await replyComment(token, {
          cid: Number(options.cid),
          id: Number(options.id),
          comment: options.comment,
          aiModelName: options.model,
          withoutMention: options['without-mention'] !== undefined ? Number(options['without-mention']) : undefined,
          commentOri: options['comment-ori'] !== undefined ? Number(options['comment-ori']) : undefined,
          isRepost: options['is-repost'] !== undefined ? Number(options['is-repost']) : undefined,
        });
        break;
      }

      case 'comments': {
        if (!options.id) {
          Logger.error('需要指定 --id 参数（微博ID）');
          process.exit(1);
        }
        const token = await getValidTokenForCommand();
        result = await getComments(token, {
          id: Number(options.id),
          sinceId: options['since-id'],
          maxId: options['max-id'],
          page: options.page,
          count: options.count,
          childCount: options['child-count'],
          fetchChild: options['fetch-child'] !== undefined ? Number(options['fetch-child']) : undefined,
          isAsc: options['is-asc'] !== undefined ? Number(options['is-asc']) : undefined,
          trimUser: options['trim-user'] !== undefined ? Number(options['trim-user']) : undefined,
          isEncoded: options['is-encoded'] !== undefined ? Number(options['is-encoded']) : undefined,
        });
        break;
      }

      case 'child-comments': {
        if (!options.id) {
          Logger.error('需要指定 --id 参数（评论楼层ID）');
          process.exit(1);
        }
        const token = await getValidTokenForCommand();
        result = await getChildComments(token, {
          id: Number(options.id),
          sinceId: options['since-id'],
          maxId: options['max-id'],
          page: options.page,
          count: options.count,
          trimUser: options['trim-user'] !== undefined ? Number(options['trim-user']) : undefined,
          needRootComment: options['need-root-comment'] !== undefined ? Number(options['need-root-comment']) : undefined,
          isAsc: options['is-asc'] !== undefined ? Number(options['is-asc']) : undefined,
          isEncoded: options['is-encoded'] !== undefined ? Number(options['is-encoded']) : undefined,
        });
        break;
      }

      default:
        Logger.error(`未知命令: ${command}`);
        console.log('使用 "node weibo-crowd.js help" 查看帮助信息');
        process.exit(1);
    }

    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    if (error instanceof ConfigError) {
      Logger.error(error.message);
    } else if (error instanceof TokenError) {
      Logger.error(`Token 错误: ${error.message}`);
      if (error.retryable) {
        Logger.info('这是一个可重试的错误，请稍后再试');
      }
    } else if (error instanceof APIError) {
      Logger.error(`API 错误 (${error.code}): ${error.message}`);
      if (error.retryable) {
        Logger.info('这是一个可重试的错误，请稍后再试');
      }
    } else {
      Logger.error(`请求失败: ${error.message}`);
    }
    process.exit(1);
  }
}

// 导出函数供模块使用
export {
  getToken,
  refreshToken,
  getTopicNames,
  getTimeline,
  createPost,
  createComment,
  replyComment,
  getComments,
  getChildComments,
  loadConfig,
  saveLocalConfig,
  TokenManager,
  encrypt,
  decrypt,
  CONFIG_PATHS,
};

// 如果直接运行脚本，执行主函数
main();
