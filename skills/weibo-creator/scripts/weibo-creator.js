#!/usr/bin/env node

/**
 * 微博创作者数据摘要脚本
 *
 * 使用方法:
 *   node weibo-creator.js summary --token=<token>
 *
 * 命令:
 *   summary    获取创作者数据摘要（近30天阅读/发博/互动、近7天粉丝铁粉、铁粉画像、热门博文）
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
 * 获取创作者数据摘要
 *
 * 返回结构（CreatorSummary）包含：
 *   - uid: 用户 uid
 *   - readTrend30Days: 近30天每日阅读趋势（DailyReadData[]）
 *   - readSourceSummary30Days: 近30日分场景阅读汇总（ReadSourceSummary）
 *   - postTrend30Days: 近30天每日发博趋势（DailyPostData[]）
 *   - interactTrend30Days: 近30天每日互动趋势（DailyInteractData[]）
 *   - fanTrend7Days: 近7天每日粉丝&铁粉趋势（DailyFanData[]）
 *   - bigFanPortrait: 铁粉画像（BigFanPortrait）
 *   - topBlogs: 近期热门博文列表（BlogDetail[]，最多5条）
 *
 * @param {string} token - 认证令牌
 * @returns {Promise<object>} 创作者数据摘要
 */
async function getCreatorSummary(token) {
  const params = new URLSearchParams({ token });
  const url = `${BASE_URL}/open/creator/summary?${params.toString()}`;
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
微博创作者数据摘要脚本

使用方法:
  node weibo-creator.js <command> [options]

命令:
  summary    获取创作者数据摘要
  help       显示帮助信息

选项:
  --token=<token>    微博 API 访问令牌（必填，通过 weibo_token 工具获取）

示例:
  node weibo-creator.js summary --token=<your_token>

返回数据说明:
  data.uid                      用户 uid
  data.readTrend30Days          近30天每日阅读趋势（date, totalReadCount）
  data.readSourceSummary30Days  近30日分场景阅读汇总
    .followReadCount / followReadRate   关注流阅读数/占比（私域）
    .profileReadCount / profileReadRate 个人主页阅读数/占比（私域）
    .searchReadCount / searchReadRate   搜索阅读数/占比（公域）
    .hotReadCount / hotReadRate         推荐阅读数/占比（公域）
    .othersReadCount / othersReadRate   其他阅读数/占比
  data.postTrend30Days          近30天每日发博趋势（date, statusCount）
  data.interactTrend30Days      近30天每日互动趋势（date, repostCount, commentCount, likeCount）
  data.fanTrend7Days            近7天每日粉丝&铁粉趋势（date, fansTotal, newFansCount, bigFanTotal, newBigFanCount）
  data.bigFanPortrait           铁粉画像
    .pyramid    铁粉分布（钻粉/金粉/铁粉 -> 百分比）
    .gender     性别分布（男性/女性 -> 百分比）
    .age        年龄分布（小于18/18-24/25-34/35-44/大于44 -> 百分比）
    .province   地区分布 TOP5（省份 -> 百分比）
    .tags       兴趣分布 TOP5（兴趣标签 -> 百分比）
    .source     来源场景 TOP5（来源名称 -> 百分比）
  data.topBlogs                 近期热门博文列表（最多5条）
    .mid            博文 mid
    .weiboText      博文正文（截断预览）
    .createTimeText 发博日期（yyyy-MM-dd）
    .hasVid         是否含视频（0=否/1=是）
    .readTotal      单条博文阅读总数
    .readFans       粉丝阅读数
    .readNonfans    非粉丝阅读数
    .repostTotal    转发总数
    .commentTotal   评论总数
    .likeTotal      赞总数
    .interactTotal  互动总数（转发+评论+点赞）
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
        result = await getCreatorSummary(options.token);
        break;
      }

      default:
        console.error(`未知命令: ${command}`);
        console.log('使用 "node weibo-creator.js help" 查看帮助信息');
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
  getCreatorSummary,
};

main();
