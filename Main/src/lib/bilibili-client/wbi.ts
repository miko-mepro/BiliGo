const NAV_URL = "https://api.bilibili.com/x/web-interface/nav";
const WBI_KEY_TTL_MS = 6 * 60 * 60 * 1000;

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
] as const;

const WBI_VALUE_FILTER = /[!'()*]/g;

type WbiKeys = {
  imgKey: string;
  subKey: string;
};

type WbiKeyCache = WbiKeys & {
  fetchedAt: number;
};

let keyCache: WbiKeyCache | undefined;
let pendingKeyFetch: Promise<WbiKeys> | undefined;

const MD5_SHIFT_AMOUNTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
] as const;

const MD5_CONSTANTS = Array.from({ length: 64 }, (_, index) =>
  Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0
);

export function mixinKey(orig: string, key: string): string {
  if (!orig) {
    throw new Error("imgKey is required");
  }
  if (!key) {
    throw new Error("subKey is required");
  }

  const rawKey = orig + key;
  if (rawKey.length < MIXIN_KEY_ENC_TAB.length) {
    throw new Error("WBI keys must contain at least 64 characters combined");
  }

  return MIXIN_KEY_ENC_TAB.map((index) => rawKey[index]).join("").slice(0, 32);
}

export function wbiSign(params: URLSearchParams, imgKey: string, subKey: string): URLSearchParams {
  const signed = new URLSearchParams(params);
  signed.delete("w_rid");
  signed.delete("wts");

  const timestamp = Math.round(Date.now() / 1000).toString();
  signed.append("wts", timestamp);

  const query = buildSigningQuery(signed);
  signed.append("w_rid", md5(query + mixinKey(imgKey, subKey)));

  return signed;
}

export async function getWbiKeys(): Promise<WbiKeys> {
  const now = Date.now();
  if (keyCache && now - keyCache.fetchedAt < WBI_KEY_TTL_MS) {
    return { imgKey: keyCache.imgKey, subKey: keyCache.subKey };
  }

  pendingKeyFetch ??= fetchWbiKeys()
    .then((keys) => {
      keyCache = { ...keys, fetchedAt: Date.now() };
      return keys;
    })
    .finally(() => {
      pendingKeyFetch = undefined;
    });

  return pendingKeyFetch;
}

export async function wbiFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  const response = await fetchSigned(input, init, false);
  if (!(await shouldRefreshAndRetry(response))) {
    return response;
  }

  keyCache = undefined;
  return fetchSigned(input, init, true);
}

export function __resetWbiKeyCacheForTests(): void {
  keyCache = undefined;
  pendingKeyFetch = undefined;
}

export function __setWbiKeyCacheForTests(cache: WbiKeyCache): void {
  keyCache = cache;
  pendingKeyFetch = undefined;
}

async function fetchSigned(input: string | URL, init: RequestInit | undefined, forceRefresh: boolean): Promise<Response> {
  const keys = forceRefresh ? await refreshWbiKeys() : await getWbiKeys();
  const url = new URL(input.toString());
  const signedParams = wbiSign(url.searchParams, keys.imgKey, keys.subKey);
  url.search = buildFinalQuery(signedParams);
  // 每次 fetch 独立合成本地超时 signal，不透传外部 init.signal，
  // 以保证 401/-352 重试场景下每一次请求都重新计时 10s。
  return fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(10_000) });
}

async function refreshWbiKeys(): Promise<WbiKeys> {
  keyCache = undefined;
  pendingKeyFetch = undefined;
  return getWbiKeys();
}

async function shouldRefreshAndRetry(response: Response): Promise<boolean> {
  if (response.status === 401) {
    return true;
  }

  const body = await response
    .clone()
    .json()
    .catch(() => undefined);

  return isBilibiliRiskResponse(body);
}

function isBilibiliRiskResponse(body: unknown): body is { code: number } {
  return typeof body === "object" && body !== null && "code" in body && body.code === -352;
}

async function fetchWbiKeys(): Promise<WbiKeys> {
  // 加入 10s 超时，避免导航接口长时间挂起导致 WBI 密钥拉取阻塞
  const response = await fetch(NAV_URL, {
    referrer: "https://www.bilibili.com/",
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch WBI keys: HTTP ${response.status}`);
  }

  const body = (await response.json()) as {
    data?: {
      wbi_img?: {
        img_url?: unknown;
        sub_url?: unknown;
      };
    };
  };
  const imgUrl = body.data?.wbi_img?.img_url;
  const subUrl = body.data?.wbi_img?.sub_url;

  if (typeof imgUrl !== "string" || typeof subUrl !== "string") {
    throw new Error("WBI nav response is missing img_url or sub_url");
  }

  return {
    imgKey: extractKeyFromUrl(imgUrl),
    subKey: extractKeyFromUrl(subUrl),
  };
}

function extractKeyFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const filename = pathname.slice(pathname.lastIndexOf("/") + 1);
  const extensionIndex = filename.lastIndexOf(".");
  return extensionIndex === -1 ? filename : filename.slice(0, extensionIndex);
}

function buildSigningQuery(params: URLSearchParams): string {
  return Array.from(params.entries())
    .sort(([leftKey], [rightKey]) => compareKeys(leftKey, rightKey))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value.replace(WBI_VALUE_FILTER, ""))}`)
    .join("&");
}

function buildFinalQuery(params: URLSearchParams): string {
  return Array.from(params.entries())
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function compareKeys(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function md5(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const padded = createMd5PaddedMessage(bytes);
  const view = new DataView(padded.buffer);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let chunkOffset = 0; chunkOffset < padded.length; chunkOffset += 64) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    const words = Array.from({ length: 16 }, (_, index) => view.getUint32(chunkOffset + index * 4, true));

    for (let index = 0; index < 64; index += 1) {
      const { value, wordIndex } = md5Round(index, b, c, d);
      const rotated = leftRotate((a + value + MD5_CONSTANTS[index] + words[wordIndex]) >>> 0, MD5_SHIFT_AMOUNTS[index]);

      a = d;
      d = c;
      c = b;
      b = (b + rotated) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0].map(wordToLittleEndianHex).join("");
}

function createMd5PaddedMessage(bytes: Uint8Array): Uint8Array {
  const byteLengthWithOneBit = bytes.length + 1;
  const zeroPaddingLength =
    byteLengthWithOneBit % 64 <= 56 ? 56 - (byteLengthWithOneBit % 64) : 120 - (byteLengthWithOneBit % 64);
  const padded = new Uint8Array(byteLengthWithOneBit + zeroPaddingLength + 8);
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;

  padded.set(bytes);
  padded[bytes.length] = 0x80;
  view.setUint32(padded.length - 8, bitLength >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bitLength / 0x100000000), true);

  return padded;
}

function md5Round(index: number, b: number, c: number, d: number): { value: number; wordIndex: number } {
  if (index < 16) {
    return { value: (b & c) | (~b & d), wordIndex: index };
  }
  if (index < 32) {
    return { value: (d & b) | (~d & c), wordIndex: (5 * index + 1) % 16 };
  }
  if (index < 48) {
    return { value: b ^ c ^ d, wordIndex: (3 * index + 5) % 16 };
  }
  return { value: c ^ (b | ~d), wordIndex: (7 * index) % 16 };
}

function leftRotate(value: number, amount: number): number {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}

function wordToLittleEndianHex(word: number): string {
  let hex = "";
  for (let index = 0; index < 4; index += 1) {
    hex += ((word >>> (index * 8)) & 0xff).toString(16).padStart(2, "0");
  }
  return hex;
}
