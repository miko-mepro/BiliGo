import { tool } from 'ai'
import { z } from 'zod'
import type { BilibiliVideoCard, BilibiliSearchParams } from '../lib/shared-types/index.js'
import { searchVideo } from '../lib/bilibili-client/search.js'
import type { CoverInput } from './analyze-covers.js'

/**
 * Bilibili SESSDATA cookie 的源 URL（3.1 §14）。
 *
 * service worker 通过 `chrome.cookies.get({ url, name: 'SESSDATA' })` 读取，
 * 失败或未登录返回 undefined，搜索以游客身份进行（可能触发 -352 风控）。
 */
const SESSDATA_COOKIE_URL = 'https://www.bilibili.com'
const SESSDATA_COOKIE_NAME = 'SESSDATA'

/**
 * analyzeCovers 可选依赖类型（3.1 §15）。
 *
 * 本工具仅在 `analyze_covers=true` 时调用 analyzeCovers；SB-5 已实现
 * `./analyze-covers.js#analyzeCovers`，此处以函数签名注入以避免与 SB-5
 * 形成静态导入循环（SB-4 单测不依赖 analyzeCovers 实现）。
 *
 * 返回 `Map<bvid, 描述>`；描述缺失的条目直接跳过（不附加 coverDescription）。
 */
export type AnalyzeCoversFn = (
  covers: CoverInput[],
  maxN?: number,
) => Promise<Map<string, string>>

/**
 * 封面分析的硬上限（3.3 §5.3 / 3.1 §15）。
 *
 * 与 `analyze-covers.ts` 的 HARD_MAX_COVERS 保持一致；这里独立声明以避免
 * SB-4 与 SB-5 之间形成静态依赖。
 */
const HARD_MAX_COVERS = 5

/** bilibili_search 工厂依赖：analyzeCovers 可选注入。 */
export interface BilibiliSearchDeps {
  analyzeCovers?: AnalyzeCoversFn
}

/** bilibili_search 工具输入（AI SDK tool() inputSchema，3.1 §5 / 3.3 §5）。 */
export const bilibiliSearchInputSchema = z.object({
  keyword: z.string().describe('搜索关键词，必填'),
  order: z
    .enum(['totalrank', 'click', 'pubdate', 'dm', 'stow'])
    .optional()
    .describe('排序方式：综合/播放/发布/弹幕/收藏'),
  analyze_covers: z
    .boolean()
    .optional()
    .describe('是否对前 5 条视频的封面做视觉分析并附加描述'),
})

/**
 * bilibili_search 工具工厂：返回 AI SDK tool() 对象。
 *
 * 行为契约（3.3 §5 / 4.2 SB-4）：
 * 1. keyword 为空（空串或仅空白）抛 `Error("bilibili_search requires a keyword argument")`。
 * 2. 通过 `chrome.cookies.get` 读取 SESSDATA；缺失时以 undefined 调用 searchVideo（游客搜索）。
 * 3. 调用 `searchVideo(keyword, { order }, sessdata)`；风控 -352 由 search.ts 抛出
 *    `BilibiliRiskError`，调用方（SC-1）转为 `error` 消息 code=`BILIBILI_RISK`。
 * 4. `analyze_covers=true` 时，对前 5 条有 bvid+pic 的视频调用 analyzeCovers，
 *    将描述附加到对应视频的 `coverDescription` 字段。
 * 5. 返回 `BilibiliVideoCard[]`；视频列表/工具结果的 Port 推送由 SC-1 统一完成。
 */
export function createBilibiliSearchTool(deps: BilibiliSearchDeps = {}) {
  return tool({
    description:
      '在 Bilibili 上按关键词搜索视频，返回带播放量/作者/时长等元信息的视频卡片列表',
    inputSchema: bilibiliSearchInputSchema,
    execute: async ({ keyword, order, analyze_covers }) => {
      return executeBilibiliSearch(keyword, order, analyze_covers, deps.analyzeCovers)
    },
  })
}

/**
 * bilibili_search 执行逻辑（3.3 §5）。
 *
 * 导出以供单测直接调用，绕过 AI SDK tool() 的 execute 包装。
 *
 * @param keyword 搜索关键词，空串/仅空白会抛 Error
 * @param order 排序方式，可选
 * @param analyzeCovers 是否做封面分析，默认 false
 * @param analyzeCoversFn analyzeCovers 函数注入；为空时 analyze_covers=true 也不调用
 * @returns BilibiliVideoCard 列表
 */
export async function executeBilibiliSearch(
  keyword: string,
  order?: BilibiliSearchParams['order'],
  analyzeCovers?: boolean,
  analyzeCoversFn?: AnalyzeCoversFn,
): Promise<BilibiliVideoCard[]> {
  if (!keyword || keyword.trim() === '') {
    throw new Error('bilibili_search requires a keyword argument')
  }

  const sessdata = await getSessdata()

  const opts: Partial<BilibiliSearchParams> = {}
  if (order) opts.order = order

  const videos = await searchVideo(keyword, opts, sessdata)

  if (analyzeCovers === true && analyzeCoversFn) {
    const covers: CoverInput[] = videos
      .filter((v) => v.bvid && v.pic)
      .map((v) => ({ bvid: v.bvid, picUrl: v.pic }))
      .slice(0, HARD_MAX_COVERS)

    if (covers.length > 0) {
      const descriptions = await analyzeCoversFn(covers, HARD_MAX_COVERS)
      // coverDescription 由 3.3 §5.2 / 3.5 §5 约定，但 BilibiliVideoCard 类型
      // 暂未声明该可选字段（本任务禁止改 shared-types）。用断言桥接，运行时
      // 行为正确；待 shared-types 扩展后可移除断言。
      return videos.map((v): BilibiliVideoCard => {
        const desc = descriptions.get(v.bvid)
        return desc
          ? ({ ...v, coverDescription: desc } as BilibiliVideoCard)
          : v
      })
    }
  }

  return videos
}

/**
 * 从 chrome.cookies 读取 SESSDATA（3.1 §14 / 3.3 §5.2）。
 *
 * 失败或 cookie 不存在时返回 undefined，调用方以游客身份继续搜索。
 */
async function getSessdata(): Promise<string | undefined> {
  try {
    const cookie = await chrome.cookies.get({
      url: SESSDATA_COOKIE_URL,
      name: SESSDATA_COOKIE_NAME,
    })
    return cookie?.value
  } catch {
    return undefined
  }
}
