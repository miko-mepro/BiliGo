const SUGGEST_URL = 'https://s.search.bilibili.com/main/suggest'

export type SuggestItem = {
  value: string
  ref: number
  type: string
}

type BilibiliSuggestResponse = {
  code?: number
  message?: string
  result?: {
    tag?: Array<{
      value?: unknown
      ref?: unknown
      type?: unknown
    }>
  }
}

export async function searchSuggest(term: string): Promise<SuggestItem[]> {
  if (!term) {
    throw new Error('term required')
  }

  const url = new URL(SUGGEST_URL)
  url.search = `term=${encodeURIComponent(term)}&main_ver=v1`

  try {
    const response = await fetch(url, {
      referrer: 'https://www.bilibili.com/',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const body = (await response.json()) as BilibiliSuggestResponse

    if (body.code !== 0) {
      throw new Error(`API error: code ${body.code}`)
    }

    const tags = body.result?.tag
    if (!tags?.length) {
      return []
    }

    return tags.map((tag) => ({
      value: typeof tag.value === 'string' ? tag.value : '',
      ref: typeof tag.ref === 'number' ? tag.ref : 0,
      type: typeof tag.type === 'string' ? tag.type : '',
    }))
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }
}
