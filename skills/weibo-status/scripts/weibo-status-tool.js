#!/usr/bin/env node

/**
 * 微博状态查询脚本
 *
 * 使用方法:
 *   node weibo-status-show.js status-show --token=<token> --id=4559512851192225
 *   node weibo-status-show.js status-show --token=<token> --url="https://m.weibo.cn/status/JBAV53jMk"
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';

const BASE_URL = 'https://open-im.api.weibo.com';

// ============================================================================
// HTTP 请求
// ============================================================================

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
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`解析响应失败: ${body}`)); }
      });
    });

    req.on('error', (e) => { reject(e); });
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// ============================================================================
// API 函数
// ============================================================================

/**
 * 根据MID或URL获取单条微博内容
 * @param {string} token - 认证令牌
 * @param {object} options - 查询选项
 * @param {string} [options.id] - 微博MID（与url二选一）
 * @param {string} [options.url] - 微博URL（与id二选一）
 * @returns {Promise<object>} 微博内容
 */
async function statusShow(token, options = {}) {
  const params = new URLSearchParams({ token });
  if (options.id) params.set('id', options.id);
  if (options.url) params.set('url', options.url);
  const url = `${BASE_URL}/open/weibo/status_show?${params.toString()}`;
  return request('GET', url);
}

// ============================================================================
// 命令行参数解析
// ============================================================================

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

// ============================================================================
// 主函数
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const options = parseArgs(args.slice(1));

  try {
    let result;

    switch (command) {
      case 'status-show': {
        if (!options.token) {
          console.error('需要指定 --token 参数，请先通过 weibo_token 工具获取');
          process.exit(1);
        }
        if (!options.id && !options.url) {
          console.error('需要指定 --id 参数（微博MID）或 --url 参数（微博URL）');
          process.exit(1);
        }
        result = await statusShow(options.token, {
          id: options.id,
          url: options.url,
        });
        break;
      }

      default:
        console.error(`未知命令: ${command}`);
        process.exit(1);
    }

    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error(`请求失败: ${error.message}`);
    process.exit(1);
  }
}

// 导出函数供模块使用
export {
  statusShow,
};

main();
