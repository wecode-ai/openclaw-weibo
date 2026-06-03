#!/usr/bin/env node

/**
 * 微博激励计划数据摘要脚本
 *
 * 使用方法:
 *   node weibo-adincentive.js summary --token=<token>
 *
 * 命令:
 *   summary    获取激励计划数据摘要（在线计划列表、计划高收益博文示例、博主优质博文）
 *   help       显示帮助信息
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';

const BASE_URL = 'https://open-im.api.weibo.com';

// ============================================================================
// HTTP 请求
// ============================================================================

/**
 * 发送 HTTP 请求
 * @param {string} method - HTTP 方法
 * @param {string} url - 请求 URL
 * @param {object|null} data - 请求数据（POST 时使用）
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
 * 获取激励计划数据摘要
 *
 * 返回结构（AdIncentiveSummary）包含：
 *   - uid: 用户 uid
 *   - userLevel: 用户认证等级（如"金V"、"蓝V"、"普通用户"等）
 *   - plans: 在线激励计划列表（IncentivePlan[]）
 *   - totalPlans: 在线激励计划总数
 *   - planRanks: 计划高收益博文示例（Map<key, PlanRank>，通过planName与plans关联）
 *   - myBlogs: 博主近7日高收益博文列表（MyBlog[]）
 *
 * @param {string} token - 认证令牌
 * @returns {Promise<object>} 激励计划数据摘要
 */
async function getAdIncentiveSummary(token) {
  const params = new URLSearchParams({ token });
  const url = `${BASE_URL}/open/adincentive/summary?${params.toString()}`;
  return request('GET', url);
}

// ============================================================================
// 命令行参数解析
// ============================================================================

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

// ============================================================================
// 帮助信息
// ============================================================================

function printHelp() {
  console.log(`
微博激励计划数据摘要脚本

使用方法:
  node weibo-adincentive.js <command> [options]

命令:
  summary    获取激励计划数据摘要
  help       显示帮助信息

选项:
  --token=<token>    微博 API 访问令牌（必填，通过 weibo_token 工具获取）

示例:
  node weibo-adincentive.js summary --token=<your_token>

返回数据说明:
  data.uid                       用户 uid
  data.userLevel                 用户认证等级（如"金V"、"蓝V"、"普通用户"等）
  data.plans                     在线激励计划列表
    .name                        计划名称
    .desc                        计划描述/规则简介
    .category                    业务分类标识（hot/video/campus/cross/other）
    .categoryName                业务分类中文名
    .prUrl                       计划PR博文链接
    .hasRank                     是否有高收益博文示例（周榜数据）
    .tags[]                      激励内容方向标签列表
      .name                      方向标签名称
  data.totalPlans                在线激励计划总数
  data.planRanks                 计划高收益博文示例（Map结构，通过planName与plans关联）
    .<key>.planName              计划名称
    .<key>.rankRule              高收益博文示例规则说明
    .<key>.prUrl                 计划PR博文链接
    .<key>.period                当前示例周期（最新一周）
    .<key>.categories[]          分类tab列表
      .cateId                    分类ID
      .name                      分类名称
    .<key>.blogs[]               高收益博文示例列表
      .mid                       博文mid
      .text                      博文正文内容
      .topics[]                  命中话题列表
      .category                  所属类别/tab名称
      .hasVideo                  是否含视频
    .<key>.totalInPage           当前页博文数量
    .<key>.hasMore               是否有更多数据
  data.myBlogs                   博主近7日高收益博文列表
    .mid                         博文mid
    .text                        博文正文内容
    .createTime                  发博日期（Y-m-d）
    .topics[]                    命中话题列表
    .hasVideo                    是否含视频
    .matchedPlans[]              命中的激励计划列表
      .name                      计划名称
      .prUrl                     计划PR链接
`);
}

// ============================================================================
// 主函数
// ============================================================================

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
      case 'summary': {
        if (!options.token) {
          console.error('需要指定 --token 参数，请先通过 weibo_token 工具获取');
          process.exit(1);
        }
        result = await getAdIncentiveSummary(options.token);
        break;
      }

      default:
        console.error(`未知命令: ${command}`);
        console.log('使用 "node weibo-adincentive.js help" 查看帮助信息');
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
  getAdIncentiveSummary,
};

main();
