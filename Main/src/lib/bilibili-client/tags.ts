import { BilibiliApiError, BilibiliNetworkError } from './search.js'

export type VideoTag = {
  tag_id: number
  tag_name: string
  cover?: string
}

type BilibiliTagsResponse = {
  code?: number
  message?: string
  data?: Array<{
    tag_id?: unknown
    tag_name?: unknown
    cover?: unknown
  }>
}

const TAGS_URL = 'https://api.bilibili.com/x/web-interface/view/detail/tag'
const BVID_PATTERN = /^BV[A-Za-z0-9]{8,12}$/

export async function fetchVideoTags(
  bvid: string,
  sessdata?: string,
): Promise<VideoTag[]> {
  if (!bvid || typeof bvid !== 'string') {
    throw new BilibiliApiError('Invalid bvid parameter')
  }
  if (!BVID_PATTERN.test(bvid)) {
    throw new BilibiliApiError(`Invalid bvid format: ${bvid}`)
  }

  const url = new URL(TAGS_URL)
  url.searchParams.set('bvid', bvid)

  try {
    // 加入 10s 超时，避免标签拉取长时间挂起
    const response = await fetch(url.toString(), {
      headers: buildHeaders(sessdata),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new BilibiliNetworkError(
        `Failed to fetch tags: HTTP ${response.status}`,
      )
    }

    const body = (await response.json().catch((error: unknown) => {
      throw new BilibiliApiError(
        `Failed to parse tags response: ${stringifyError(error)}`,
      )
    })) as BilibiliTagsResponse

    if (body.code !== 0) {
      throw new BilibiliApiError(
        body.message ?? 'Failed to fetch tags',
        body.code,
      )
    }

    const tags = body.data ?? []
    return tags.map((tag) => ({
      tag_id: toNumber(tag.tag_id),
      tag_name: toStringValue(tag.tag_name),
      cover: typeof tag.cover === 'string' ? tag.cover : undefined,
    }))
  } catch (error) {
    if (error instanceof BilibiliApiError || error instanceof BilibiliNetworkError) {
      throw error
    }
    throw new BilibiliNetworkError(
      `Failed to fetch tags: ${stringifyError(error)}`,
      error,
    )
  }
}

// SESSDATA 合法字符集：仅允许字母/数字及 B 站实际使用的符号子集。
// 不合规时降级匿名搜索（不附 Cookie），避免脏 cookie 直接炸掉标签拉取。
const SESSDATA_PATTERN = /^[A-Za-z0-9%,*_-]+$/;

function buildHeaders(sessdata: string | undefined): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  // 仅在 SESSDATA 通过格式校验时才附加 Cookie，否则降级匿名请求
  if (sessdata && SESSDATA_PATTERN.test(sessdata)) {
    headers.Cookie = `SESSDATA=${sessdata}`
  }
  return headers
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value) || 0
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
