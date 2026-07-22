import React, { useCallback } from 'react';
import type { BilibiliVideoCard } from '../lib/shared-types/index.js'

interface VideoCardProps {
  video: BilibiliVideoCard;
}

/**
 * Formats play count to B站 style (e.g., 12345 -> "1.2万")
 * 修复 #3：play 可能缺失或类型异常，非法值一律按 0 处理，避免 toString 崩溃
 */
function formatPlayCount(count: unknown): string {
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    return '0';
  }
  if (count >= 100_000_000) {
    const yi = (count / 100_000_000).toFixed(1);
    const formatted = yi.endsWith('.0') ? yi.slice(0, -2) : yi;
    return `${formatted}亿`;
  }
  if (count >= 10000) {
    const wan = (count / 10000).toFixed(1);
    // Remove trailing .0 if it's a whole number
    const formatted = wan.endsWith('.0') ? wan.slice(0, -2) : wan;
    return `${formatted}万`;
  }
  return count.toString();
}

/**
 * Parses title and converts <em class="keyword"> tags to bold elements
 * Also strips any other HTML tags for security
 */
function parseTitle(title: string | undefined): React.ReactNode {
  // 防御：title 缺失时不渲染任何内容，避免 undefined.replace 崩溃
  if (typeof title !== 'string') {
    return null;
  }
  // First, remove dangerous tags and their content completely
  let sanitized = title;
  const dangerousTags = ['script', 'style', 'iframe', 'object', 'embed'];
  for (const tag of dangerousTags) {
    const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    sanitized = sanitized.replace(regex, '');
  }

  // Handle keyword highlighting
  const parts = sanitized.split(/(<em[^>]*>.*?<\/em>)/gi);

  return parts.map((part, index) => {
    // Check if this part is an em tag with keyword class
    const emMatch = part.match(/<em[^>]*class=["']keyword["'][^>]*>(.*?)<\/em>/i);
    if (emMatch) {
      return <strong key={index}>{emMatch[1]}</strong>;
    }

    // Strip any other HTML tags for security
    const cleanPart = part.replace(/<[^>]+>/g, '');
    return <React.Fragment key={index}>{cleanPart}</React.Fragment>;
  });
}

export function VideoCard({ video }: VideoCardProps): React.ReactElement {
  const handleClick = useCallback(() => {
    const url = `https://www.bilibili.com/video/${video.bvid}`;
    if (chrome?.tabs?.create) {
      void chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [video.bvid]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter') {
        handleClick();
      }
    },
    [handleClick]
  );

  // 修复 #3：pic 可能是非字符串（如对象）或空串，先做运行时类型检查再调用字符串方法，
  // 非法值统一按"无封面"处理
  const rawPic = typeof video.pic === 'string' ? video.pic : '';
  const hasCover = rawPic.trim().length > 0;
  const coverSrc = hasCover
    ? rawPic.startsWith('//')
      ? `https:${rawPic}`
      : rawPic.startsWith('http://')
        ? rawPic.replace(/^http:\/\//, 'https://')
        : rawPic
    : '';

  return (
    <button
      type="button"
      className="bili-agent-video-card"
      data-bili-agent-card
      data-testid="video-card"
      data-bvid={video.bvid}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label={`打开视频: ${video.title}`}
    >
      <div className="bili-agent-video-card__cover" data-testid="video-cover-container">
        {hasCover ? (
          <img
            src={coverSrc}
            alt="视频封面"
            className="bili-agent-video-card__cover-img"
            loading="lazy"
          />
        ) : (
          <div className="bili-agent-video-card__cover-placeholder">
            <span>无封面</span>
          </div>
        )}
        <span className="bili-agent-video-card__duration">{video.duration}</span>
      </div>

      <div className="bili-agent-video-card__info">
        <h3 className="bili-agent-video-card__title">{parseTitle(video.title)}</h3>

        <div className="bili-agent-video-card__meta">
          <span className="bili-agent-video-card__author">{video.author}</span>
        </div>

        <div className="bili-agent-video-card__stats">
          <span className="bili-agent-video-card__stat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {formatPlayCount(video.play)}
          </span>

          <span className="bili-agent-video-card__stat">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {video.favorites}
          </span>
        </div>
      </div>
    </button>
  );
}
