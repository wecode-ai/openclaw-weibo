#!/usr/bin/env node

/**
 * 微博 Skill 公共模块
 *
 * 提供以下公共能力：
 * - 加密/解密（AES-256-GCM，基于机器特征生成密钥）
 * - 配置管理（统一路径 ~/.weibo-skill/）
 * - Token 管理（自动缓存、刷新）
 * - HTTP 请求工具
 * - 日志工具
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ============================================================================
// 配置常量
// ============================================================================

export const BASE_URL = 'https://open-im.api.weibo.com';

export const CONFIG_PATHS = {
  local: path.join(os.homedir(), '.weibo-skill', 'config.json'),
  tokenCache: path.join(os.homedir(), '.weibo-skill', 'token-cache.json'),
};

// ============================================================================
// 错误类定义
// ============================================================================

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class TokenError extends Error {
  constructor(message, retryable = false) {
    super(message);
    this.name = 'TokenError';
    this.retryable = retryable;
  }
}

export class APIError extends Error {
  constructor(message, code, retryable = false) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.retryable = retryable;
  }
}

// 通用错误码映射
export const COMMON_ERROR_MESSAGES = {
  40100: 'Token 无效或已过期，请重新登录',
  42900: '频率限制：超过每日调用次数上限，请明天再试',
  50000: '服务器内部错误，请稍后重试',
  50001: '操作失败，请检查参数后重试',
};

// 可重试的错误码
export const RETRYABLE_ERRORS = new Set([50000, 50001]);

// ============================================================================
// 日志工具
// ============================================================================

// 调试模式开关（默认关闭）
const DEBUG_MODE = false;

export const Logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ✓ ${msg}`),
  warn: (msg) => console.warn(`[WARN] ⚠ ${msg}`),
  error: (msg) => console.error(`[ERROR] ✗ ${msg}`),
  debug: (msg) => DEBUG_MODE && console.log(`[DEBUG] ${msg}`),
  progress: (current, total, msg) => {
    const percent = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
    process.stdout.write(`\r[${bar}] ${percent}% ${msg}`);
    if (current === total) console.log();
  },
};

// ============================================================================
// 加密模块
// ============================================================================

/**
 * 生成加密密钥（基于机器特征）
 * @returns {Buffer} 32 字节的加密密钥
 */
export function generateEncryptionKey() {
  const machineId = `${os.hostname()}-${os.homedir()}`;
  return crypto.createHash('sha256').update(machineId).digest();
}

/**
 * 加密文本
 * @param {string} text - 要加密的文本
 * @returns {string} 加密后的字符串（格式: encrypted:iv:authTag:encrypted）
 */
export function encrypt(text) {
  const key = generateEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `encrypted:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * 解密文本
 * @param {string} encryptedText - 加密的文本
 * @returns {string} 解密后的原文
 */
export function decrypt(encryptedText) {
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
 * 加载配置
 * 从 ~/.weibo-skill/config.json 读取
 * @returns {Promise<object>} 配置对象
 */
export async function loadConfig() {
  const config = {
    appId: undefined,
    appSecret: undefined,
  };

  try {
    const localData = await fs.readFile(CONFIG_PATHS.local, 'utf8');
    const localConfig = JSON.parse(localData);

    if (localConfig.appId) {
      config.appId = decrypt(localConfig.appId);
    }
    if (localConfig.appSecret) {
      config.appSecret = decrypt(localConfig.appSecret);
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
export async function saveLocalConfig(config) {
  const encryptedConfig = {
    appId: encrypt(config.appId),
    appSecret: encrypt(config.appSecret),
  };

  await fs.mkdir(path.dirname(CONFIG_PATHS.local), { recursive: true });

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
 * 自动缓存、检查有效期、刷新 Token
 */
export class TokenManager {
  constructor() {
    this.tokenCache = null;
  }

  /**
   * 检查 Token 是否有效（提前 60 秒过期）
   * @returns {boolean}
   */
  isTokenValid() {
    if (!this.tokenCache) return false;
    const expiresAt =
      this.tokenCache.acquiredAt + (this.tokenCache.expiresIn - 60) * 1000;
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
      const message =
        COMMON_ERROR_MESSAGES[result.code] || result.message || '获取 Token 失败';
      throw new TokenError(message, RETRYABLE_ERRORS.has(result.code));
    }

    this.tokenCache = {
      token: result.data.token,
      uid: result.data.uid,
      acquiredAt: Date.now(),
      expiresIn: result.data.expire_in,
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

// 全局 TokenManager 单例
export const tokenManager = new TokenManager();

// ============================================================================
// HTTP 请求工具
// ============================================================================

/**
 * 发送 HTTP/HTTPS 请求（JSON）
 * @param {string} method - HTTP 方法
 * @param {string} url - 请求 URL
 * @param {object|null} data - 请求体数据（POST 时使用）
 * @returns {Promise<object>} 响应数据
 */
export function request(method, url, data = null) {
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
        Accept: 'application/json',
      },
    };

    const req = httpModule.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
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
 * 发送带二进制数据的 HTTP/HTTPS 请求
 * @param {string} url - 请求 URL
 * @param {Buffer} data - 二进制数据
 * @returns {Promise<object>} 响应数据
 */
export function requestWithBinary(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': data.length,
        Accept: 'application/json',
      },
    };

    const req = httpModule.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`解析响应失败: ${body}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

// ============================================================================
// Token API
// ============================================================================

/**
 * 获取 Token
 * @param {string} appId - 开发者应用 ID
 * @param {string} appSecret - 开发者应用密钥
 * @returns {Promise<object>} Token 信息
 */
export async function getToken(appId, appSecret) {
  const url = `${BASE_URL}/open/auth/ws_token`;
  const data = {
    app_id: appId,
    app_secret: appSecret,
  };
  return request('POST', url, data);
}

// ============================================================================
// 通用命令处理
// ============================================================================

/**
 * 处理 login 命令（参数模式）
 * @param {string} appId - 应用 ID
 * @param {string} appSecret - 应用密钥
 * @param {string} skillName - Skill 名称（用于显示）
 */
export async function handleLoginCommand(appId, appSecret, skillName = '微博 Skill') {
  if (!appId || !appSecret) {
    throw new ConfigError(
      '需要提供 --app-id 和 --app-secret 参数\n' +
      '用法: node scripts/weibo-skill.js login --app-id=<ID> --app-secret=<Secret>'
    );
  }

  const config = { appId, appSecret };
  await saveLocalConfig(config);
  Logger.info('配置已保存');

  Logger.info('正在获取访问令牌...');
  try {
    const token = await tokenManager.fetchNewToken(config.appId, config.appSecret);
    Logger.success('登录成功！');
    console.log(
      JSON.stringify(
        {
          code: 0,
          message: 'success',
          data: {
            token: token,
            uid: tokenManager.tokenCache.uid,
            expire_in: tokenManager.tokenCache.expiresIn,
          },
        },
        null,
        2
      )
    );
  } catch (err) {
    Logger.error(`登录失败: ${err.message}`);
    process.exit(1);
  }
}

/**
 * 获取有效的 Token（自动从配置获取）
 * @returns {Promise<string>} Token
 */
export async function getValidTokenForCommand() {
  const config = await loadConfig();

  if (!config.appId || !config.appSecret) {
    throw new ConfigError(
      '未找到配置信息，请先运行 "node scripts/weibo-skill.js login" 进行登录'
    );
  }

  return await tokenManager.getValidToken(config.appId, config.appSecret);
}

// ============================================================================
// 命令行参数解析
// ============================================================================

/**
 * 解析命令行参数
 * @param {string[]} args - 命令行参数
 * @returns {object} 解析后的参数对象
 */
export function parseArgs(args) {
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
 * 统一错误处理
 * @param {Error} error - 错误对象
 */
export function handleError(error) {
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
