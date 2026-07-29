import { BilibiliNetworkError, BilibiliApiError } from './search.js'

export type HotKeyword = {
  keyword: string
  show_name: string
  icon?: string
  pos: number
}

type HotResponse = {
  code?: number
  message?: string
  data?: {
    list?: Array<{
      position?: unknown
      keyword?: unknown
      show_name?: unknown
      icon?: unknown
    }>
  }
}

const HOT_URL = 'https://app.bilibili.com/x/v2/search/trending/ranking'

export async function searchHot(limit: number = 20): Promise<HotKeyword[]> {
  const url = new URL(HOT_URL)
  url.searchParams.set('limit', String(limit))

  try {
    // 加入 10s 超时，避免热点拉取长时间挂起
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new BilibiliNetworkError(
        `Hot search request failed: HTTP ${response.status}`,
      )
    }

    const body = (await response.json().catch((error: unknown) => {
      throw new BilibiliApiError(
        `Failed to parse hot search response: ${stringifyError(error)}`,
      )
    })) as HotResponse

    if (body.code !== 0) {
      throw new BilibiliApiError(
        body.message ?? 'Hot search request failed',
        body.code,
      )
    }

    const items = body.data?.list
    if (!items?.length) {
      return []
    }

    return items.map((item) => ({
      keyword: toStringValue(item.keyword),
      show_name: toStringValue(item.show_name),
      icon: typeof item.icon === 'string' ? item.icon : undefined,
      pos: toNumber(item.position),
    }))
  } catch (error) {
    if (
      error instanceof BilibiliNetworkError ||
      error instanceof BilibiliApiError
    ) {
      throw error
    }
    throw new BilibiliNetworkError(
      `Hot search request failed: ${stringifyError(error)}`,
      error,
    )
  }
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
