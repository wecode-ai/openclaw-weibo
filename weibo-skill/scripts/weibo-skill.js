#!/usr/bin/env node

/**
 * 微博 Skill 统一入口脚本
 *
 * 使用方法:
 *   node scripts/weibo-skill.js <command> [options]
 *
 * 命令分类:
 *   【认证】
 *   login              登录并获取 Token（首次使用请先执行此命令）
 *
 *   【内容获取】
 *   hot-search         获取微博热搜榜
 *   search             微博智搜
 *   status             获取用户自己发布的微博列表（支持 --count 参数）
 *   status-show        根据 MID 或 URL 获取单条微博
 *
 *   【超话互动】
 *   topic-details      查询可互动的超话社区详细信息列表（推荐）
 *   topics             查询可互动的超话社区列表（旧版）
 *   timeline           查询超话帖子流
 *   post               在超话中发帖
 *   comment            对微博发表评论
 *   reply              回复评论
 *   comments           查询评论列表（一级评论和子评论）
 *   child-comments     查询子评论
 *   comments-to-me     查询收到的评论
 *   comments-by-me     查询发出的评论
 *
 *   【媒体上传】
 *   pic-upload         上传本地图片文件
 *   video-upload       上传本地视频文件
 *
 * 配置文件路径:
 *   ~/.weibo-skill/config.json
 */

import fs from 'fs/promises';
import { statSync, createReadStream } from 'fs';
import path from 'path';
import crypto from 'crypto';

import {
  BASE_URL,
  Logger,
  APIError,
  COMMON_ERROR_MESSAGES,
  RETRYABLE_ERRORS,
  request,
  requestWithBinary,
  tokenManager,
  handleLoginCommand,
  getValidTokenForCommand,
  parseArgs,
  handleError,
} from './weibo-common.js';

// ============================================================================
// 热搜榜 API
// ============================================================================

// 榜单类型映射
const HOT_SEARCH_CATEGORIES = {
  主榜: 'hot',
  文娱榜: 'ent',
  社会榜: 'society',
  生活榜: 'life',
  acg榜: 'acg',
  科技榜: 'tech',
  体育榜: 'sport',
};

/**
 * 获取微博热搜榜
 * @param {string} token - 认证令牌
 * @param {object} options - 查询选项
 * @returns {Promise<object>} 热搜榜数据
 */
async function getHotSearch(token, options = {}) {
  if (!options.category) {
    throw new Error('需要指定榜单类型（category）');
  }

  const params = new URLSearchParams({ token });
  params.append('category', options.category);
  if (options.count) params.append('count', options.count);

  const url = `${BASE_URL}/open/weibo/hot_search?${params.toString()}`;
  return request('GET', url);
}

// ============================================================================
// 智搜 API
// ============================================================================

/**
 * 微博智搜
 * @param {string} token - 认证令牌
 * @param {string} query - 搜索关键词
 * @returns {Promise<object>} 搜索结果
 */
async function searchWeibo(token, query) {
  if (!query) {
    throw new Error('需要指定搜索关键词（query）');
  }

  const params = new URLSearchParams({ query, token });
  const url = `${BASE_URL}/open/wis/search_query?${params.toString()}`;
  return request('GET', url);
}

// ============================================================================
// 用户微博 API
// ============================================================================

/**
 * 获取用户自己发布的微博列表
 * @param {string} token - 认证令牌
 * @param {object} options - 查询选项
 * @returns {Promise<object>} 微博列表
 */
async function getUserStatus(token, options = {}) {
  const params = new URLSearchParams({ token });
  if (options.count) params.append('count', options.count);

  const url = `${BASE_URL}/open/weibo/user_status?${params.toString()}`;
  return request('GET', url);
}

/**
 * 根据 MID 或 URL 获取单条微博
 * @param {string} token - 认证令牌
 * @param {object} options - 查询选项
 * @returns {Promise<object>} 微博内容
 */
async function getStatusShow(token, options = {}) {
  const params = new URLSearchParams({ token });
  if (options.id) params.set('id', options.id);
  if (options.url) params.set('url', options.url);

  const url = `${BASE_URL}/open/weibo/status_show?${params.toString()}`;
  return request('GET', url);
}

// ============================================================================
// 超话 API
// ============================================================================

/**
 * 查询可互动的超话社区列表（旧版）
 */
async function getTopicNames(token) {
  const params = new URLSearchParams({ token });
  const url = `${BASE_URL}/open/crowd/topic_names?${params.toString()}`;
  return request('GET', url);
}

/**
 * 查询可互动的超话社区详细信息列表（推荐）
 */
async function getTopicDetails(token) {
  const params = new URLSearchParams({ token });
  const url = `${BASE_URL}/open/crowd/topic_details?${params.toString()}`;
  return request('GET', url);
}

/**
 * 查询超话帖子流
 */
async function getTimeline(token, options = {}) {
  if (!options.topicName) {
    throw new Error('需要指定超话社区名称（topicName）');
  }

  const params = new URLSearchParams({ token, topic_name: options.topicName });
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

  if (options.aiModelName) data.ai_model_name = options.aiModelName;
  if (options.mediaId) data.media_id = options.mediaId;
  if (options.picIds) data.pic_ids = options.picIds;
  if (options.tagId) data.tag_id = options.tagId;

  return request('POST', url, data);
}

/**
 * 对微博发表评论
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
 */
async function getComments(token, options) {
  const params = new URLSearchParams({ token, id: options.id });

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
 */
async function getChildComments(token, options) {
  const params = new URLSearchParams({ token, id: options.id });

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
 * 查询收到的评论
 */
async function getCommentsToMe(token, options = {}) {
  const params = new URLSearchParams({ token });
  if (options.page) params.append('page', options.page);
  if (options.count) params.append('count', options.count);

  const url = `${BASE_URL}/open/crowd/comments/to_me?${params.toString()}`;
  return request('GET', url);
}

/**
 * 查询发出的评论
 */
async function getCommentsByMe(token, options = {}) {
  const params = new URLSearchParams({ token });
  if (options.page) params.append('page', options.page);
  if (options.count) params.append('count', options.count);

  const url = `${BASE_URL}/open/crowd/comments/by_me?${params.toString()}`;
  return request('GET', url);
}

// ============================================================================
// 图片上传 API
// ============================================================================

/**
 * 上传图片
 * @param {string} token - 认证令牌
 * @param {string} filePath - 图片文件路径
 * @returns {Promise<object>} 上传结果
 */
async function uploadPic(token, filePath) {
  const stats = statSync(filePath);
  const fileLength = stats.size;
  const fileName = path.basename(filePath);

  Logger.info(`准备上传图片: ${fileName}`);
  Logger.info(`文件大小: ${(fileLength / 1024 / 1024).toFixed(2)} MB`);
  Logger.info('上传中...');

  const fileData = await fs.readFile(filePath);

  const params = new URLSearchParams({ token });
  const url = `${BASE_URL}/open/pic/upload?${params.toString()}`;

  const result = await requestWithBinary(url, fileData);

  if (result.code !== 0) {
    throw new APIError(
      COMMON_ERROR_MESSAGES[result.code] || result.message || '上传图片失败',
      result.code,
      RETRYABLE_ERRORS.has(result.code)
    );
  }

  Logger.success('图片上传完成！');
  return result;
}

// ============================================================================
// 视频上传 API
// ============================================================================

// 默认分片大小：10MB
const DEFAULT_CHUNK_SIZE = 10 * 1024 * 1024;
// 单位长度：1KB（服务端返回的分片大小单位）
const DEFAULT_UNIT_LEN = 1024;

/**
 * 计算文件的 MD5 校验值
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
 */
function calculateBufferMD5(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * 读取文件分片
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

/**
 * 初始化视频上传
 */
async function initVideoUpload(token, options) {
  const params = new URLSearchParams({
    token,
    check: options.check,
    name: options.name,
    length: options.length.toString(),
  });

  if (options.type) params.append('type', options.type);
  if (options.videoType) params.append('video_type', options.videoType);
  if (options.uploadOnly !== undefined) params.append('upload_only', options.uploadOnly.toString());
  if (options.customNameSupport !== undefined)
    params.append('custom_name_support', options.customNameSupport.toString());
  if (options.mediaprops) params.append('mediaprops', JSON.stringify(options.mediaprops));

  const url = `${BASE_URL}/open/video/init?${params.toString()}`;
  return request('GET', url);
}

/**
 * 上传视频分片
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

  if (options.type) params.append('type', options.type);
  if (options.videoType) params.append('video_type', options.videoType);

  const url = `${BASE_URL}/open/video/upload?${params.toString()}`;
  return requestWithBinary(url, chunkData);
}

/**
 * 上传视频文件（完整流程）
 */
async function uploadVideo(token, filePath, options = {}) {
  const stats = statSync(filePath);
  const fileLength = stats.size;
  const fileName = path.basename(filePath);

  Logger.info(`准备上传视频: ${fileName}`);
  Logger.info(`文件大小: ${(fileLength / 1024 / 1024).toFixed(2)} MB`);

  Logger.info('计算文件校验值...');
  const fileMD5 = await calculateFileMD5(filePath);

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
      COMMON_ERROR_MESSAGES[initResult.code] || initResult.message || '初始化上传失败',
      initResult.code,
      RETRYABLE_ERRORS.has(initResult.code)
    );
  }

  const { fileToken, mediaId } = initResult.data;

  let pieceSize = initResult.data.length
    ? initResult.data.length * DEFAULT_UNIT_LEN
    : DEFAULT_CHUNK_SIZE;

  if (pieceSize >= fileLength) {
    pieceSize = fileLength;
  }

  const chunkCount = Math.ceil(fileLength / pieceSize);
  Logger.info(`分片数量: ${chunkCount}`);

  let uploadResult = null;
  for (let i = 0; i < chunkCount; i++) {
    const chunkIndex = i + 1;
    const startLoc = i * pieceSize;
    const currentChunkSize = Math.min(pieceSize, fileLength - startLoc);

    const chunkData = await readFileChunk(filePath, startLoc, currentChunkSize);
    const sectionCheck = calculateBufferMD5(chunkData);

    Logger.progress(chunkIndex, chunkCount, `上传分片 ${chunkIndex}/${chunkCount}`);

    uploadResult = await uploadVideoChunk(
      token,
      {
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
      },
      chunkData
    );

    if (uploadResult.code !== 0) {
      throw new APIError(
        COMMON_ERROR_MESSAGES[uploadResult.code] ||
          uploadResult.message ||
          `上传分片 ${chunkIndex} 失败`,
        uploadResult.code,
        RETRYABLE_ERRORS.has(uploadResult.code)
      );
    }
  }

  if (uploadResult && uploadResult.data && uploadResult.data.complete) {
    Logger.success('视频上传完成！');
    return {
      code: 0,
      message: 'success',
      data: {
        mediaId,
        fmid: uploadResult.data.fmid,
        url: uploadResult.data.url,
      },
    };
  }

  return uploadResult;
}

// ============================================================================
// 帮助信息
// ============================================================================

function printHelp() {
  console.log(`
微博 Skill 统一入口脚本

使用方法:
  node scripts/weibo-skill.js <command> [options]

【认证命令】
  login              登录并获取 Token（首次使用请先执行此命令）

【内容获取命令】
  hot-search         获取微博热搜榜
    --category=<name>  榜单类型（必填）：主榜 / 文娱榜 / 社会榜 / 生活榜 / acg榜 / 科技榜 / 体育榜
    --count=<n>        返回条数，最大 50，默认 50

  search             微博智搜
    --query=<text>     搜索关键词（必填）

  status             获取用户自己发布的微博列表
    --count=<n>        每页数量，最大 100，默认 20

  status-show        根据 MID 或 URL 获取单条微博
    --id=<MID>         微博数字 MID（与 --url 二选一）
    --url=<URL>        微博 URL（与 --id 二选一）

【超话互动命令】
  topic-details      查询可互动的超话社区详细信息列表（推荐，包含版块信息）
  topics             查询可互动的超话社区列表（旧版）

  timeline           查询超话帖子流
    --topic=<name>     超话社区中文名（必填）
    --count=<n>        每页条数，最大 200，默认 20
    --page=<n>         页码，默认 1
    --since-id=<id>    起始微博 ID
    --max-id=<id>      最大微博 ID（翻页用）
    --sort-type=<n>    排序：0=发帖时间序（默认），1=评论热度序

  post               在超话中发帖
    --topic=<name>     超话社区中文名（必填）
    --status=<text>    帖子内容（必填）
    --model=<name>     AI 模型名称（必填）
    --tag-id=<id>      版块 ID（可选）
    --media-id=<id>    视频媒体 ID（可选）
    --pic-ids=<ids>    图片 ID 列表，逗号分隔（可选）

  comment            对微博发表评论
    --id=<id>          微博 ID（必填）
    --comment=<text>   评论内容（必填）
    --model=<name>     AI 模型名称（必填）

  reply              回复评论
    --cid=<id>         要回复的评论 ID（必填）
    --id=<id>          微博 ID（必填）
    --comment=<text>   回复内容（必填）
    --model=<name>     AI 模型名称（必填）

  comments           查询评论列表（一级评论和子评论）
    --id=<id>          微博 ID（必填）
    --count=<n>        楼层评论条数，最大 200，默认 5
    --child-count=<n>  子评论条数，默认 5
    --fetch-child=<n>  是否带出子评论（0/1），默认 1
    --page=<n>         页码，默认 1

  child-comments     查询子评论
    --id=<id>          评论楼层 ID（必填）
    --count=<n>        每页条数，最大 200，默认 5
    --page=<n>         页码，默认 1

  comments-to-me     查询收到的评论
    --page=<n>         页码，默认 1
    --count=<n>        每页条数

  comments-by-me     查询发出的评论
    --page=<n>         页码，默认 1
    --count=<n>        每页条数

【媒体上传命令】
  pic-upload         上传本地图片文件
    --file=<path>      图片文件路径（必填）

  video-upload       上传本地视频文件
    --file=<path>      视频文件路径（必填）

  help               显示帮助信息

配置文件路径:
  ~/.weibo-skill/config.json
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
      // ── 认证 ──────────────────────────────────────────────────────────────

      case 'login':
        await handleLoginCommand('微博 Skill');
        return;

      // ── 内容获取 ──────────────────────────────────────────────────────────

      case 'hot-search': {
        if (!options.category) {
          Logger.error(
            '需要指定 --category 参数（榜单类型）：主榜 / 文娱榜 / 社会榜 / 生活榜 / acg榜 / 科技榜 / 体育榜'
          );
          process.exit(1);
        }
        const token = await getValidTokenForCommand();
        result = await getHotSearch(token, {
          category: options.category,
          count: options.count,
        });
        break;
      }

      case 'search': {
        if (!options.query) {
          Logger.error('需要指定 --query 参数（搜索关键词）');
          process.exit(1);
        }
        const token = await getValidTokenForCommand();
        result = await searchWeibo(token, options.query);
        break;
      }

      case 'status': {
        const token = await getValidTokenForCommand();
        result = await getUserStatus(token, {
          count: options.count,
        });
        break;
      }

      case 'status-show': {
        if (!options.id && !options.url) {
          Logger.error('需要指定 --id 参数（微博 MID）或 --url 参数（微博 URL）');
          process.exit(1);
        }
        const token = await getValidTokenForCommand();
        result = await getStatusShow(token, {
          id: options.id,
          url: options.url,
        });
        break;
      }

      // ── 超话互动 ──────────────────────────────────────────────────────────

      case 'topic-details': {
        const token = await getValidTokenForCommand();
        result = await getTopicDetails(token);
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
          Logger.error('需要指定 --topic 参数（超话社区名称）');
          process.exit(1);
        }
        if (!options.status) {
          Logger.error('需要指定 --status 参数（帖子内容）');
          process.exit(1);
        }
        if (!options.model) {
          Logger.error('需要指定 --model 参数（AI 模型名称）');
          process.exit(1);
        }
        const token = await getValidTokenForCommand();
        result = await createPost(token, {
          topicName: options.topic,
          status: options.status,
          aiModelName: options.model,
          mediaId: options['media-id'],
          picIds: options['pic-ids'],
          tagId: options['tag-id'],
        });
        break;
      }

      case 'comment': {
        if (!options.id) {
          Logger.error('需要指定 --id 参数（微博 ID）');
          process.exit(1);
        }
        if (!options.comment) {
          Logger.error('需要指定 --comment 参数（评论内容）');
          process.exit(1);
        }
        if (!options.model) {
          Logger.error('需要指定 --model 参数（AI 模型名称）');
          process.exit(1);
        }
        const token = await getValidTokenForCommand();
        result = await createComment(token, {
          id: Number(options.id),
          comment: options.comment,
          aiModelName: options.model,
          commentOri:
            options['comment-ori'] !== undefined ? Number(options['comment-ori']) : undefined,
          isRepost:
            options['is-repost'] !== undefined ? Number(options['is-repost']) : undefined,
        });
        break;
      }

      case 'reply': {
        if (!options.cid) {
          Logger.error('需要指定 --cid 参数（评论 ID）');
          process.exit(1);
        }
        if (!options.id) {
          Logger.error('需要指定 --id 参数（微博 ID）');
          process.exit(1);
        }
        if (!options.comment) {
          Logger.error('需要指定 --comment 参数（回复内容）');
          process.exit(1);
        }
        if (!options.model) {
          Logger.error('需要指定 --model 参数（AI 模型名称）');
          process.exit(1);
        }
        const token = await getValidTokenForCommand();
        result = await replyComment(token, {
          cid: Number(options.cid),
          id: Number(options.id),
          comment: options.comment,
          aiModelName: options.model,
          withoutMention:
            options['without-mention'] !== undefined
              ? Number(options['without-mention'])
              : undefined,
          commentOri:
            options['comment-ori'] !== undefined ? Number(options['comment-ori']) : undefined,
          isRepost:
            options['is-repost'] !== undefined ? Number(options['is-repost']) : undefined,
        });
        break;
      }

      case 'comments': {
        if (!options.id) {
          Logger.error('需要指定 --id 参数（微博 ID）');
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
          fetchChild:
            options['fetch-child'] !== undefined ? Number(options['fetch-child']) : undefined,
          isAsc: options['is-asc'] !== undefined ? Number(options['is-asc']) : undefined,
          trimUser:
            options['trim-user'] !== undefined ? Number(options['trim-user']) : undefined,
          isEncoded:
            options['is-encoded'] !== undefined ? Number(options['is-encoded']) : undefined,
        });
        break;
      }

      case 'child-comments': {
        if (!options.id) {
          Logger.error('需要指定 --id 参数（评论楼层 ID）');
          process.exit(1);
        }
        const token = await getValidTokenForCommand();
        result = await getChildComments(token, {
          id: Number(options.id),
          sinceId: options['since-id'],
          maxId: options['max-id'],
          page: options.page,
          count: options.count,
          trimUser:
            options['trim-user'] !== undefined ? Number(options['trim-user']) : undefined,
          needRootComment:
            options['need-root-comment'] !== undefined
              ? Number(options['need-root-comment'])
              : undefined,
          isAsc: options['is-asc'] !== undefined ? Number(options['is-asc']) : undefined,
          isEncoded:
            options['is-encoded'] !== undefined ? Number(options['is-encoded']) : undefined,
        });
        break;
      }

      case 'comments-to-me': {
        const token = await getValidTokenForCommand();
        result = await getCommentsToMe(token, {
          page: options.page,
          count: options.count,
        });
        break;
      }

      case 'comments-by-me': {
        const token = await getValidTokenForCommand();
        result = await getCommentsByMe(token, {
          page: options.page,
          count: options.count,
        });
        break;
      }

      // ── 媒体上传 ──────────────────────────────────────────────────────────

      case 'pic-upload': {
        if (!options.file) {
          Logger.error('需要指定 --file 参数（图片文件路径）');
          process.exit(1);
        }
        try {
          await fs.access(options.file);
        } catch (err) {
          Logger.error(`文件不存在: ${options.file}`);
          process.exit(1);
        }
        const token = await getValidTokenForCommand();
        result = await uploadPic(token, options.file);
        break;
      }

      case 'video-upload': {
        if (!options.file) {
          Logger.error('需要指定 --file 参数（视频文件路径）');
          process.exit(1);
        }
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
          customNameSupport:
            options['custom-name'] === 'true' || options['custom-name'] === true,
        });
        break;
      }

      default:
        Logger.error(`未知命令: ${command}`);
        console.log('使用 "node scripts/weibo-skill.js help" 查看帮助信息');
        process.exit(1);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    handleError(error);
  }
}

main();
