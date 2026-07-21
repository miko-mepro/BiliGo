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

  it('does not mutate original array', () => {
    const original = [...videos];
    applySortAndFilter(videos, 'play', 'week', 'short');
    expect(videos).toEqual(original);
  });
});
