import { describe, it, expect } from 'vitest';
import {
  sortVideos,
  filterVideos,
  applySortAndFilter,
  parseDurationToSeconds,
} from '../../src/utils/sort-filter.js'
import type { BilibiliVideoCard } from '../../src/lib/shared-types/index.js'

function makeVideo(overrides: Partial<BilibiliVideoCard> = {}): BilibiliVideoCard {
  return {
    bvid: 'BV1xx411c7mD',
    aid: 1,
    title: 'Test Video',
    author: 'Test Author',
    pic: '',
    play: 0,
    videoReview: 0,
    favorites: 0,
    duration: '10:00',
    pubdate: Date.now() / 1000,
    tag: '',
    description: '',
    ...overrides,
  };
}

describe('parseDurationToSeconds', () => {
  it('parses MM:SS format', () => {
    expect(parseDurationToSeconds('5:30')).toBe(330);
    expect(parseDurationToSeconds('12:34')).toBe(754);
    expect(parseDurationToSeconds('0:45')).toBe(45);
  });

  it('parses HH:MM:SS format', () => {
    expect(parseDurationToSeconds('1:23:45')).toBe(5025);
    expect(parseDurationToSeconds('2:00:00')).toBe(7200);
    expect(parseDurationToSeconds('0:05:30')).toBe(330);
  });

  it('returns 0 for empty or invalid strings', () => {
    expect(parseDurationToSeconds('')).toBe(0);
    expect(parseDurationToSeconds('invalid')).toBe(0);
    expect(parseDurationToSeconds('abc:def')).toBe(0);
  });
});

describe('sortVideos', () => {
  const videos: BilibiliVideoCard[] = [
    makeVideo({ bvid: 'A', play: 100, favorites: 50, pubdate: 1000, duration: '5:00' }),
    makeVideo({ bvid: 'B', play: 500, favorites: 200, pubdate: 2000, duration: '15:00' }),
    makeVideo({ bvid: 'C', play: 300, favorites: 100, pubdate: 3000, duration: '25:00' }),
  ];

  it('sorts by play descending (highest first)', () => {
    const sorted = sortVideos(videos, 'play');
    expect(sorted.map((v) => v.bvid)).toEqual(['B', 'C', 'A']);
  });

  it('sorts by favorites descending (most first)', () => {
    const sorted = sortVideos(videos, 'favorites');
    expect(sorted.map((v) => v.bvid)).toEqual(['B', 'C', 'A']);
  });

  it('sorts by pubdate descending (newest first)', () => {
    const sorted = sortVideos(videos, 'pubdate');
    expect(sorted.map((v) => v.bvid)).toEqual(['C', 'B', 'A']);
  });

  it('sorts by duration descending (longest first)', () => {
    const sorted = sortVideos(videos, 'duration');
    expect(sorted.map((v) => v.bvid)).toEqual(['C', 'B', 'A']);
  });

  it('keeps backend rerank order without mutating the source array', () => {
    const sorted = sortVideos(videos, 'rerank');
    expect(sorted.map((v) => v.bvid)).toEqual(['A', 'B', 'C']);
    expect(sorted).not.toBe(videos);
  });

  it('does not mutate original array', () => {
    const original = [...videos];
    sortVideos(videos, 'play');
    expect(videos).toEqual(original);
  });
});

describe('filterVideos', () => {
  const now = Date.now() / 1000;
  const videos: BilibiliVideoCard[] = [
    makeVideo({ bvid: 'A', pubdate: now - 3 * 86400, duration: '3:00' }), // 3 days ago, <5min
    makeVideo({ bvid: 'B', pubdate: now - 15 * 86400, duration: '10:00' }), // 15 days ago, 5-20min
    makeVideo({ bvid: 'C', pubdate: now - 60 * 86400, duration: '30:00' }), // 60 days ago, >20min
    makeVideo({ bvid: 'D', pubdate: now - 400 * 86400, duration: '5:00' }), // 400 days ago, 5-20min
  ];

  describe('date filtering', () => {
    it('filters by week (7 days)', () => {
      const filtered = filterVideos(videos, 'week', 'all');
      expect(filtered.map((v) => v.bvid)).toEqual(['A']);
    });

    it('filters by month (30 days)', () => {
      const filtered = filterVideos(videos, 'month', 'all');
      expect(filtered.map((v) => v.bvid)).toEqual(['A', 'B']);
    });

    it('filters by year (365 days)', () => {
      const filtered = filterVideos(videos, 'year', 'all');
      expect(filtered.map((v) => v.bvid)).toEqual(['A', 'B', 'C']);
    });

    it('allows all dates with all filter', () => {
      const filtered = filterVideos(videos, 'all', 'all');
      expect(filtered.map((v) => v.bvid)).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  describe('duration filtering', () => {
    it('filters videos under 5 minutes', () => {
      const filtered = filterVideos(videos, 'all', 'short');
      expect(filtered.map((v) => v.bvid)).toEqual(['A']);
    });

    it('filters videos between 5-20 minutes', () => {
      const filtered = filterVideos(videos, 'all', 'medium');
      expect(filtered.map((v) => v.bvid)).toEqual(['B', 'D']);
    });

    it('filters videos over 20 minutes', () => {
      const filtered = filterVideos(videos, 'all', 'long');
      expect(filtered.map((v) => v.bvid)).toEqual(['C']);
    });

    it('allows all durations with all filter', () => {
      const filtered = filterVideos(videos, 'all', 'all');
      expect(filtered.map((v) => v.bvid)).toEqual(['A', 'B', 'C', 'D']);
    });
  });

  describe('combined filtering', () => {
    it('applies both date and duration filters', () => {
      const filtered = filterVideos(videos, 'month', 'medium');
      expect(filtered.map((v) => v.bvid)).toEqual(['B']);
    });

    it('returns empty array when no videos match', () => {
      const filtered = filterVideos(videos, 'week', 'long');
      expect(filtered).toEqual([]);
    });
  });

  it('does not mutate original array', () => {
    const original = [...videos];
    filterVideos(videos, 'week', 'short');
    expect(videos).toEqual(original);
  });
});

describe('applySortAndFilter', () => {
  const now = Date.now() / 1000;
  const videos: BilibiliVideoCard[] = [
    makeVideo({ bvid: 'A', play: 100, pubdate: now - 3 * 86400, duration: '3:00', favorites: 10 }),
    makeVideo({ bvid: 'B', play: 500, pubdate: now - 15 * 86400, duration: '10:00', favorites: 50 }),
    makeVideo({ bvid: 'C', play: 300, pubdate: now - 60 * 86400, duration: '25:00', favorites: 30 }),
  ];

  it('applies filter then sort', () => {
    const result = applySortAndFilter(videos, 'play', 'month', 'all');
    // month filter keeps A and B, then sort by play descending
    expect(result.map((v) => v.bvid)).toEqual(['B', 'A']);
  });

  it('applies duration filter with sort', () => {
    const result = applySortAndFilter(videos, 'favorites', 'all', 'medium');
    // medium duration keeps B only (10:00)
    expect(result.map((v) => v.bvid)).toEqual(['B']);
  });

  it('returns empty array when nothing matches', () => {
    const result = applySortAndFilter(videos, 'play', 'week', 'long');
    expect(result).toEqual([]);
  });

  it('filters rerank results while preserving their original order', () => {
    const result = applySortAndFilter(videos, 'rerank', 'month', 'all');
    expect(result.map((v) => v.bvid)).toEqual(['A', 'B']);
  });

  // ===== 缺口5：rerank 数组经过 MessageList 后的最终 DOM 顺序 =====

  // 场景A：rerank 数组经过 applySortAndFilter 后顺序与输入一致（全量，无筛选）
  it('rerank 数组经过 applySortAndFilter 后顺序与输入一致（无筛选）', () => {
    // 构造 rerank 输入：[BV2, BV1, BV3]（重排后顺序，非播放量降序）
    const rerankVideos: BilibiliVideoCard[] = [
      makeVideo({ bvid: 'BV2', play: 100 }),
      makeVideo({ bvid: 'BV1', play: 900 }),
      makeVideo({ bvid: 'BV3', play: 500 }),
    ];

    const result = applySortAndFilter(rerankVideos, 'rerank', 'all', 'all');

    // 顺序保持与输入一致，不被播放量排序覆盖
    expect(result.map((v) => v.bvid)).toEqual(['BV2', 'BV1', 'BV3']);
  });

  // 场景B：rerank 数组经过时长筛选后顺序保持（单一结果验证筛选有效）
  it('rerank 数组经过时长筛选后只保留符合条件的视频', () => {
    // 构造：BV2(3min), BV1(10min), BV3(25min)，rerank 顺序 [BV2, BV1, BV3]
    // medium 筛选保留 5-20 分钟（300-1200 秒），BV2 的 3:00=180s < 300 被排除
    const rerankVideos: BilibiliVideoCard[] = [
      makeVideo({ bvid: 'BV2', duration: '3:00' }),
      makeVideo({ bvid: 'BV1', duration: '10:00' }),
      makeVideo({ bvid: 'BV3', duration: '25:00' }),
    ];

    // medium 筛选只保留 BV1（10:00 = 600s，在 300-1200 范围内）
    const result = applySortAndFilter(rerankVideos, 'rerank', 'all', 'medium');

    expect(result.map((v) => v.bvid)).toEqual(['BV1']);
  });

  // 场景C：rerank 数组经过日期筛选后多个结果顺序保持
  it('rerank 数组经过日期筛选后多个结果保持 rerank 相对顺序', () => {
    // 构造：BV2(3天前), BV1(15天前), BV3(60天前)，rerank 顺序 [BV2, BV1, BV3]
    const rerankVideos: BilibiliVideoCard[] = [
      makeVideo({ bvid: 'BV2', pubdate: now - 3 * 86400 }),
      makeVideo({ bvid: 'BV1', pubdate: now - 15 * 86400 }),
      makeVideo({ bvid: 'BV3', pubdate: now - 60 * 86400 }),
    ];

    // month 筛选保留 30 天内（BV3 的 60 天被筛掉，剩余 BV2, BV1 保持 rerank 顺序）
    const result = applySortAndFilter(rerankVideos, 'rerank', 'month', 'all');

    expect(result.map((v) => v.bvid)).toEqual(['BV2', 'BV1']);
  });

  // 场景D：rerank 与播放量排序冲突时，rerank 模式不被播放量覆盖
  it('rerank 与播放量排序冲突时，rerank 模式保留后端顺序', () => {
    // 构造：BV2(play=100), BV1(play=900), BV3(play=500)，rerank 顺序 [BV2, BV1, BV3]
    // 播放量降序应为 [BV1, BV3, BV2]，与 rerank 顺序冲突
    const rerankVideos: BilibiliVideoCard[] = [
      makeVideo({ bvid: 'BV2', play: 100 }),
      makeVideo({ bvid: 'BV1', play: 900 }),
      makeVideo({ bvid: 'BV3', play: 500 }),
    ];

    const result = applySortAndFilter(rerankVideos, 'rerank', 'all', 'all');

    // rerank 模式保留后端顺序，不被播放量降序覆盖
    expect(result.map((v) => v.bvid)).toEqual(['BV2', 'BV1', 'BV3']);
  });

  // 场景E：rerank 数组多元素混合筛选后顺序保持
  it('rerank 数组多元素混合筛选后保持 rerank 相对顺序', () => {
    // 构造 5 个视频，rerank 顺序 [BV5, BV3, BV1, BV4, BV2]
    // 各有不同 pubdate 和 duration，用于混合筛选验证
    const rerankVideos: BilibiliVideoCard[] = [
      makeVideo({ bvid: 'BV5', pubdate: now - 3 * 86400, duration: '3:00' }),  // 周 + 短
      makeVideo({ bvid: 'BV3', pubdate: now - 10 * 86400, duration: '10:00' }), // 周 + 中
      makeVideo({ bvid: 'BV1', pubdate: now - 20 * 86400, duration: '15:00' }), // 月 + 中
      makeVideo({ bvid: 'BV4', pubdate: now - 40 * 86400, duration: '10:00' }), // 年 + 中
      makeVideo({ bvid: 'BV2', pubdate: now - 50 * 86400, duration: '25:00' }), // 年 + 长
    ];

    // month + medium 筛选：保留 30 天内且 5-20 分钟
    // BV3(10天,10:00) 和 BV1(20天,15:00) 符合，保持 rerank 相对顺序
    const result = applySortAndFilter(rerankVideos, 'rerank', 'month', 'medium');

    expect(result.map((v) => v.bvid)).toEqual(['BV3', 'BV1']);
  });

  it('does not mutate original array', () => {
    const original = [...videos];
    applySortAndFilter(videos, 'play', 'week', 'short');
    expect(videos).toEqual(original);
  });
});
