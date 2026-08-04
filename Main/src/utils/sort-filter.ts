import type { BilibiliVideoCard } from '../lib/shared-types/index.js'

export type SortField = 'play' | 'pubdate' | 'duration' | 'favorites' | 'rerank';
export type DateFilter = 'all' | 'week' | 'month' | 'year';
export type DurationFilter = 'all' | 'short' | 'medium' | 'long';

/**
 * Parses a duration string (MM:SS or HH:MM:SS) into total seconds.
 * Returns 0 for empty or invalid strings.
 */
export function parseDurationToSeconds(duration: string): number {
  if (!duration || typeof duration !== 'string') return 0;

  const parts = duration.split(':').map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;

  if (parts.length === 2) {
    // MM:SS
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    // HH:MM:SS
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return 0;
}

/**
 * Sorts a copy of the video array by the specified field in descending order.
 * `rerank` explicitly keeps the backend-provided order.
 */
export function sortVideos(videos: BilibiliVideoCard[], sortField: SortField): BilibiliVideoCard[] {
  // 智能排序保留后端重排顺序，只复制数组以避免修改状态源。
  if (sortField === 'rerank') return [...videos];

  const sorted = [...videos];

  sorted.sort((a, b) => {
    switch (sortField) {
      case 'play':
        return b.play - a.play;
      case 'favorites':
        return b.favorites - a.favorites;
      case 'pubdate':
        return b.pubdate - a.pubdate;
      case 'duration': {
        const durationA = parseDurationToSeconds(a.duration);
        const durationB = parseDurationToSeconds(b.duration);
        return durationB - durationA;
      }
      default:
        return 0;
    }
  });

  return sorted;
}

/**
 * Filters a copy of the video array by date and/or duration criteria.
 */
export function filterVideos(
  videos: BilibiliVideoCard[],
  dateFilter: DateFilter,
  durationFilter: DurationFilter
): BilibiliVideoCard[] {
  const now = Date.now() / 1000;

  return videos.filter((video) => {
    // Date filter
    if (dateFilter !== 'all') {
      const ageInSeconds = now - video.pubdate;
      switch (dateFilter) {
        case 'week':
          if (ageInSeconds > 7 * 86400) return false;
          break;
        case 'month':
          if (ageInSeconds > 30 * 86400) return false;
          break;
        case 'year':
          if (ageInSeconds > 365 * 86400) return false;
          break;
      }
    }

    // Duration filter
    if (durationFilter !== 'all') {
      const durationSec = parseDurationToSeconds(video.duration);
      switch (durationFilter) {
        case 'short':
          if (durationSec >= 300) return false;
          break;
        case 'medium':
          if (durationSec < 300 || durationSec > 1200) return false;
          break;
        case 'long':
          if (durationSec <= 1200) return false;
          break;
      }
    }

    return true;
  });
}

/**
 * Applies both filter and sort to the video array.
 * Filter is applied first, then sort.
 */
export function applySortAndFilter(
  videos: BilibiliVideoCard[],
  sortField: SortField,
  dateFilter: DateFilter,
  durationFilter: DurationFilter
): BilibiliVideoCard[] {
  const filtered = filterVideos(videos, dateFilter, durationFilter);
  return sortVideos(filtered, sortField);
}
