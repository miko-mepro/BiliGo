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
    const response = await fetch(url.toString(), {
      headers: buildHeaders(sessdata),
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

function buildHeaders(sessdata: string | undefined): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (sessdata) {
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
