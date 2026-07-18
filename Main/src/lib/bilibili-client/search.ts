import type { BilibiliSearchParams, BilibiliVideoCard } from "../shared-types/index.js";
import { wbiFetch } from "./wbi.js";

const SEARCH_URL = "https://api.bilibili.com/x/web-interface/wbi/search/type";

type BilibiliSearchResponse = {
  code?: number;
  message?: string;
  data?: {
    result?: BilibiliSearchResult[];
  };
};

type BilibiliSearchResult = {
  aid?: unknown;
  bvid?: unknown;
  title?: unknown;
  author?: unknown;
  pic?: unknown;
  tag?: unknown;
  play?: unknown;
  video_review?: unknown;
  favorites?: unknown;
  duration?: unknown;
  pubdate?: unknown;
  description?: unknown;
};

export class BilibiliRiskError extends Error {
  readonly code = -352;

  constructor(message = "Bilibili risk control triggered") {
    super(message);
    this.name = "BilibiliRiskError";
  }
}

export class BilibiliNetworkError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "BilibiliNetworkError";
    this.cause = cause;
  }
}

export class BilibiliApiError extends Error {
  readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = "BilibiliApiError";
    this.code = code;
  }
}

export function searchVideo(keyword: string, opts?: BilibiliSearchParams, sessdata?: string): Promise<BilibiliVideoCard[]>;
export function searchVideo(keyword: string, opts?: Partial<BilibiliSearchParams>, sessdata?: string): Promise<BilibiliVideoCard[]>;
export async function searchVideo(
  keyword: string,
  opts: Partial<BilibiliSearchParams> = {},
  sessdata?: string
): Promise<BilibiliVideoCard[]> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("search_type", "video");
  url.searchParams.set("keyword", keyword);
  url.searchParams.set("page", String(opts.page ?? 1));
  url.searchParams.set("page_size", String(opts.pageSize ?? 20));
  if (opts.order) {
    url.searchParams.set("order", opts.order);
  }

  const response = await fetchSearch(url, sessdata);
  const body = (await response.json().catch((error: unknown) => {
    throw new BilibiliApiError(`Failed to parse Bilibili search response: ${stringifyError(error)}`);
  })) as BilibiliSearchResponse;

  if (body.code === -352) {
    throw new BilibiliRiskError(body.message ?? "Bilibili risk control triggered");
  }
  if (body.code !== 0) {
    throw new BilibiliApiError(body.message ?? "Bilibili search request failed", body.code);
  }

  const results = body.data?.result;
  if (!results?.length) {
    return [];
  }

  return results.map(mapVideoCard);
}

async function fetchSearch(url: URL, sessdata: string | undefined): Promise<Response> {
  try {
    const response = await wbiFetch(url, {
      referrer: "https://www.bilibili.com/",
      credentials: "include",
      headers: buildHeaders(sessdata),
    });

    if (!response.ok) {
      throw new BilibiliNetworkError(`Bilibili search request failed: HTTP ${response.status}`);
    }

    return response;
  } catch (error) {
    if (error instanceof BilibiliNetworkError) {
      throw error;
    }
    throw new BilibiliNetworkError(`Bilibili search request failed: ${stringifyError(error)}`, error);
  }
}

function buildHeaders(sessdata: string | undefined): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (sessdata) {
    headers.Cookie = `SESSDATA=${sessdata}`;
  }
  return headers;
}

function mapVideoCard(result: BilibiliSearchResult): BilibiliVideoCard {
  return {
    aid: toNumber(result.aid),
    bvid: toStringValue(result.bvid),
    title: toStringValue(result.title),
    author: toStringValue(result.author),
    pic: toStringValue(result.pic),
    tag: toStringValue(result.tag),
    play: toNumber(result.play),
    videoReview: toNumber(result.video_review),
    favorites: toNumber(result.favorites),
    duration: toStringValue(result.duration),
    pubdate: toNumber(result.pubdate),
    description: toStringValue(result.description),
  };
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value) || 0;
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
