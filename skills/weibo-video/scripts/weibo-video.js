#!/usr/bin/env node

/**
 * 微博视频上传 API 封装脚本
 *
 * 使用方法:
 *   node weibo-video.js <command> [options]
 *
 * 命令:
 *   login              登录并获取 Token（整合原 token 命令功能）
 *   refresh            刷新 Token
 *   upload             上传本地视频文件
 *
 * 配置优先级:
 *   1. 本地配置文件 ~/.weibo-video/config.json
 *   2. OpenClaw 配置文件 ~/.openclaw/openclaw.json
 *
 * 示例:
 *   # 登录（首次使用会引导配置）
 *   node weibo-video.js login
 *
 *   # 上传视频（自动使用缓存的 Token）
 *   node weibo-video.js upload --file="/path/to/video.mp4"
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import fs from 'fs/promises';
import { createReadStream, statSync } from 'fs';
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

// 默认分片大小：10MB（与参考代码一致）
const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024;

// 单位长度：1KB（用于将服务端返回的分片大小从 KB 转换为 Byte）
const DEFAULT_UNIT_LEN = 1024;

const CONFIG_PATHS = {
  openclaw: path.join(os.homedir(), '.openclaw', 'openclaw.json'),
  local: path.join(os.homedir(), '.weibo-video', 'config.json'),
  tokenCache: path.join(os.homedir(), '.weibo-video', 'token-cache.json')
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
  40001: '参数缺失：token、check、name 或 length',
  40002: '参数缺失或超限',
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

// 调试模式开关（默认关闭）
const DEBUG_MODE = false;

const Logger = {
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
  }
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
    appId: undefined,
    appSecret: undefined
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
  console.log('\n=== 微博视频上传配置向导 ===\n');
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
 * 发送带二进制数据的 HTTP 请求
 * @param {string} url - 请求 URL
 * @param {Buffer} data - 二进制数据
 * @returns {Promise<object>} 响应数据
 */
function requestWithBinary(url, data) {
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

    req.write(data);
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
// 文件工具函数
// ============================================================================

/**
 * 计算文件的 MD5 校验值
 * @param {string} filePath - 文件路径
 * @returns {Promise<string>} MD5 校验值（十六进制）
 */
async function calculateFileMD5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * 计算 Buffer 的 MD5 校验值
 * @param {Buffer} buffer - 数据缓冲区
 * @returns {string} MD5 校验值（十六进制）
 */
function calculateBufferMD5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * 读取文件分片
 * @param {string} filePath - 文件路径
 * @param {number} start - 起始位置
 * @param {number} size - 分片大小
 * @returns {Promise<Buffer>} 分片数据
 */
async function readFileChunk(filePath, start, size) {
  const fileHandle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await fileHandle.read(buffer, 0, size, start);
    return buffer.slice(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
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
 * 初始化视频上传
 * @param {string} token - 认证令牌
 * @param {object} options - 上传选项
 * @returns {Promise<object>} 初始化结果
 */
async function initVideoUpload(token, options) {
  const params = new URLSearchParams({
    token,
    check: options.check,
    name: options.name,
    length: options.length.toString(),
  });

  // 可选参数
  if (options.type) params.append('type', options.type);
  if (options.videoType) params.append('video_type', options.videoType);
  if (options.uploadOnly !== undefined) params.append('upload_only', options.uploadOnly.toString());
  if (options.customNameSupport !== undefined) params.append('custom_name_support', options.customNameSupport.toString());
  if (options.mediaprops) params.append('mediaprops', JSON.stringify(options.mediaprops));

  const url = `${BASE_URL}/open/video/init?${params.toString()}`;
  return request('GET', url);
}

/**
 * 上传视频分片
 * @param {string} token - 认证令牌
 * @param {object} options - 分片选项
 * @param {Buffer} chunkData - 分片数据
 * @returns {Promise<object>} 上传结果
 */
async function uploadVideoChunk(token, options, chunkData) {
  const params = new URLSearchParams({
    token,
    filetoken: options.fileToken,
    filelength: options.fileLength.toString(),
    filecheck: options.fileCheck,
    chunksize: options.chunkSize.toString(),
    startloc: options.startLoc.toString(),
    chunkindex: options.chunkIndex.toString(),
    chunkcount: options.chunkCount.toString(),
    sectioncheck: options.sectionCheck,
  });

  // 可选参数
  if (options.type) params.append('type', options.type);
  if (options.videoType) params.append('video_type', options.videoType);

  const url = `${BASE_URL}/open/video/upload?${params.toString()}`;
  return requestWithBinary(url, chunkData);
}

/**
 * 上传视频文件（完整流程）
 * @param {string} token - 认证令牌
 * @param {string} filePath - 视频文件路径
 * @param {object} options - 上传选项
 * @returns {Promise<object>} 上传结果
 */
async function uploadVideo(token, filePath, options = {}) {
  // 获取文件信息
  const stats = statSync(filePath);
  const fileLength = stats.size;
  const fileName = path.basename(filePath);
  
  Logger.info(`准备上传视频: ${fileName}`);
  Logger.info(`文件大小: ${(fileLength / 1024 / 1024).toFixed(2)} MB`);
  
  // 计算文件 MD5
  Logger.info('计算文件校验值...');
  const fileMD5 = await calculateFileMD5(filePath);
  Logger.debug(`文件 MD5: ${fileMD5}`);
  
  // 初始化上传
  Logger.info('初始化上传...');
  const initResult = await initVideoUpload(token, {
    check: fileMD5,
    name: fileName,
    length: fileLength,
    type: options.type || 'video',
    videoType: options.videoType || 'normal',
    uploadOnly: options.uploadOnly,
    customNameSupport: options.customNameSupport,
    mediaprops: options.mediaprops,
  });
  
  if (initResult.code !== 0) {
    throw new APIError(
      ERROR_MESSAGES[initResult.code] || initResult.message || '初始化上传失败',
      initResult.code,
      RETRYABLE_ERRORS.has(initResult.code)
    );
  }
  
  const { fileToken, mediaId } = initResult.data;
  Logger.debug(`fileToken: ${fileToken}`);
  Logger.debug(`mediaId: ${mediaId}`);
  
  // 计算分片大小（服务端返回的 length 单位是 KB，需要转换为 Byte）
  // 如果服务端没有返回 length，使用默认分片大小
  let pieceSize = initResult.data.length
    ? initResult.data.length * DEFAULT_UNIT_LEN
    : DEFAULT_CHUNK_SIZE;
  
  // 如果分片大小大于等于文件大小，使用文件大小作为分片大小
  if (pieceSize >= fileLength) {
    pieceSize = fileLength;
  }
  
  Logger.debug(`分片大小: ${(pieceSize / 1024 / 1024).toFixed(2)} MB`);
  
  // 计算分片数量
  const chunkCount = Math.ceil(fileLength / pieceSize);
  Logger.info(`分片数量: ${chunkCount}`);
  
  // 上传分片
  let uploadResult = null;
  for (let i = 0; i < chunkCount; i++) {
    const chunkIndex = i + 1;
    const startLoc = i * pieceSize;
    const currentChunkSize = Math.min(pieceSize, fileLength - startLoc);
    
    // 读取分片数据
    const chunkData = await readFileChunk(filePath, startLoc, currentChunkSize);
    const sectionCheck = calculateBufferMD5(chunkData);
    
    Logger.progress(chunkIndex, chunkCount, `上传分片 ${chunkIndex}/${chunkCount}`);
    
    uploadResult = await uploadVideoChunk(token, {
      fileToken,
      fileLength,
      fileCheck: fileMD5,
      chunkSize: chunkData.length,
      startLoc,
      chunkIndex,
      chunkCount,
      sectionCheck,
      type: options.type || 'video',
      videoType: options.videoType || 'normal',
    }, chunkData);
    
    if (uploadResult.code !== 0) {
      throw new APIError(
        ERROR_MESSAGES[uploadResult.code] || uploadResult.message || `上传分片 ${chunkIndex} 失败`,
        uploadResult.code,
        RETRYABLE_ERRORS.has(uploadResult.code)
      );
    }
  }
  
  // 返回最终结果
  if (uploadResult && uploadResult.data && uploadResult.data.complete) {
    Logger.success('视频上传完成！');
    return {
      code: 0,
      message: 'success',
      data: {
        mediaId,
        fmid: uploadResult.data.fmid,
        url: uploadResult.data.url,
      }
    };
  }
  
  return uploadResult;
}

// ============================================================================
// 命令处理
// ============================================================================

/**
 * 处理 login 命令
 */
async function handleLoginCommand() {
  console.log('\n=== 微博视频上传登录 ===\n');

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
    
    // 输出 JSON 格式
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
 * 获取有效的 Token（自动从配置获取）
 * @returns {Promise<string>} Token
 */
async function getValidTokenForCommand() {
  // 从配置获取 Token
  const config = await loadConfig();
  
  if (!config.appId || !config.appSecret) {
    throw new ConfigError('未找到配置信息，请先运行 "node weibo-video.js login" 进行登录');
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
微博视频上传 API 封装脚本

使用方法:
  node weibo-video.js <command> [options]

命令:
  login              登录并获取 Token（首次使用请先执行此命令）
  refresh            刷新 Token
  upload             上传本地视频文件
  help               显示帮助信息

配置优先级:
  1. 本地配置文件 ~/.weibo-video/config.json
  2. OpenClaw 配置文件 ~/.openclaw/openclaw.json

选项:
  --file=<path>      视频文件路径（必填）
  --type=<type>      文件类型，默认 video（可选）
  --video-type=<type> 视频类型，默认 normal（可选）
  --upload-only      是否仅上传，默认 false（可选）
  --custom-name      是否支持自定义名称，默认 false（可选）

示例:
  # 首次使用，登录并配置
  node weibo-video.js login

  # 上传视频（自动使用缓存的 Token）
  node weibo-video.js upload --file="/path/to/video.mp4"
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

      case 'upload': {
        if (!options.file) {
          Logger.error('需要指定 --file 参数（视频文件路径）');
          process.exit(1);
        }
        
        // 检查文件是否存在
        try {
          await fs.access(options.file);
        } catch (err) {
          Logger.error(`文件不存在: ${options.file}`);
          process.exit(1);
        }
        
        const token = await getValidTokenForCommand();
        result = await uploadVideo(token, options.file, {
          type: options.type,
          videoType: options['video-type'],
          uploadOnly: options['upload-only'] === 'true' || options['upload-only'] === true,
          customNameSupport: options['custom-name'] === 'true' || options['custom-name'] === true,
        });
        break;
      }

      default:
        Logger.error(`未知命令: ${command}`);
        console.log('使用 "node weibo-video.js help" 查看帮助信息');
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
  initVideoUpload,
  uploadVideoChunk,
  uploadVideo,
  loadConfig,
  saveLocalConfig,
  TokenManager,
  encrypt,
  decrypt,
  CONFIG_PATHS,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_UNIT_LEN,
  calculateFileMD5,
  calculateBufferMD5,
};

// 如果直接运行脚本，执行主函数
main();
