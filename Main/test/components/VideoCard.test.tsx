import React from 'react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { VideoCard } from '../../src/components/VideoCard.js'
import type { BilibiliVideoCard } from '../../src/lib/shared-types/index.js'

describe('VideoCard', () => {
  const mockVideo: BilibiliVideoCard = {
    bvid: 'BV1xx411c7mD',
    aid: 12345678,
    title: '这是一个测试视频标题',
    author: '测试UP主',
    pic: 'https://example.com/cover.jpg',
    play: 1234567,
    videoReview: 888,
    favorites: 456,
    duration: '12:34',
    pubdate: 1234567890,
    tag: '编程,技术',
    description: '这是一个测试视频描述',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('renders video cover image', () => {
      render(<VideoCard video={mockVideo} />);

      const coverImg = screen.getByRole('img', { name: /视频封面/i });
      expect(coverImg).toBeInTheDocument();
      expect(coverImg).toHaveAttribute('src', mockVideo.pic);
    });

    it('renders video title', () => {
      render(<VideoCard video={mockVideo} />);

      expect(screen.getByText(mockVideo.title)).toBeInTheDocument();
    });

    it('renders author name', () => {
      render(<VideoCard video={mockVideo} />);

      expect(screen.getByText(mockVideo.author)).toBeInTheDocument();
    });

    it('renders play count in formatted way', () => {
      render(<VideoCard video={mockVideo} />);

      // 1234567 -> "123.5万"
      expect(screen.getByText(/123\.5万/)).toBeInTheDocument();
    });

    it('renders small play counts as plain numbers', () => {
      const smallPlayVideo = { ...mockVideo, play: 9999 };
      render(<VideoCard video={smallPlayVideo} />);

      expect(screen.getByText('9999')).toBeInTheDocument();
    });

    it('renders duration in MM:SS format', () => {
      render(<VideoCard video={mockVideo} />);

      expect(screen.getByText(mockVideo.duration)).toBeInTheDocument();
    });

    it('renders duration in HH:MM:SS format for long videos', () => {
      const longVideo = { ...mockVideo, duration: '1:23:45' };
      render(<VideoCard video={longVideo} />);

      expect(screen.getByText('1:23:45')).toBeInTheDocument();
    });

    it('renders favorites count', () => {
      render(<VideoCard video={mockVideo} />);

      // Use within to scope to the card and find favorites specifically
      const card = screen.getByRole('button', { name: /打开视频/i });
      expect(within(card).getByText(/456/)).toBeInTheDocument();
    });
  });

  describe('Placeholder handling', () => {
    it('shows placeholder when pic is empty string', () => {
      const noPicVideo = { ...mockVideo, pic: '' };
      render(<VideoCard video={noPicVideo} />);

      expect(screen.getByText('无封面')).toBeInTheDocument();
    });

    it('shows placeholder when pic is missing', () => {
      const noPicVideo = { ...mockVideo, pic: '' };
      render(<VideoCard video={noPicVideo} />);

      const placeholder = screen.getByText('无封面');
      expect(placeholder).toBeInTheDocument();
    });
  });

  describe('Title highlighting', () => {
    it('renders highlighted keywords in bold', () => {
      const videoWithKeyword = {
        ...mockVideo,
        title: '这是一个<em class="keyword">编程</em>视频',
      };
      render(<VideoCard video={videoWithKeyword} />);

      const boldElement = screen.getByText('编程');
      expect(boldElement.tagName.toLowerCase()).toBe('strong');
    });

    it('strips other HTML tags from title', () => {
      const videoWithHtml = {
        ...mockVideo,
        title: '这是一个<script>alert(1)</script>视频',
      };
      render(<VideoCard video={videoWithHtml} />);

      // TODO-20：删除 dangerousTags 白名单循环后，<script> 标签本身被剥离，
      // 但其文本内容 alert(1) 会作为纯文本保留（非可执行代码，无 XSS 风险）。
      // React 渲染时会做 HTML 实体转义兜底，确保不作为 HTML 执行。
      expect(screen.getByText('这是一个alert(1)视频')).toBeInTheDocument();
      // 确认没有任何 script 标签被渲染到 DOM
      expect(document.querySelector('script')).toBeNull();
    });

    it('strips svg tag with onerror event handler (XSS prevention)', () => {
      // TODO-20：svg/onerror 是危险的自闭合/事件式标签，
      // 删除白名单循环后改由 /<[^>]*>/g 统一剥离，确保不渲染为元素
      const videoWithSvg = {
        ...mockVideo,
        title: '视频<svg/onload=alert(1)>标题',
      };
      render(<VideoCard video={videoWithSvg} />);

      // 标签被剥离为纯文本，alert(1) 不作为可执行代码出现
      expect(screen.getByText('视频标题')).toBeInTheDocument();
      expect(document.querySelector('svg[onload], svg[onerror]')).toBeNull();
    });

    it('strips img tag with onerror event handler (XSS prevention)', () => {
      // TODO-20：img/onerror 是典型 XSS 向量，
      // 经 /<[^>]*>/g 剥离后只剩纯文本，不渲染 img 元素
      const videoWithImg = {
        ...mockVideo,
        title: '封面<img src=x onerror=alert(document.cookie)>说明',
      };
      render(<VideoCard video={videoWithImg} />);

      expect(screen.getByText('封面说明')).toBeInTheDocument();
      const renderedImg = document.querySelector('img[onerror]');
      expect(renderedImg).toBeNull();
    });

    it('handles multiple keywords', () => {
      const videoWithKeywords = {
        ...mockVideo,
        title: '<em class="keyword">Python</em>和<em class="keyword">JavaScript</em>对比',
      };
      render(<VideoCard video={videoWithKeywords} />);

      expect(screen.getByText('Python')).toBeInTheDocument();
      expect(screen.getByText('JavaScript')).toBeInTheDocument();
    });
  });

  describe('Click to jump', () => {
    it('opens bilibili video tab on click', () => {
      render(<VideoCard video={mockVideo} />);

      const card = screen.getByRole('button', { name: /打开视频/i });
      fireEvent.click(card);

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: `https://www.bilibili.com/video/${mockVideo.bvid}`,
      });
    });

    it('card is clickable', () => {
      render(<VideoCard video={mockVideo} />);

      const card = screen.getByRole('button', { name: /打开视频/i });
      expect(card).toBeInTheDocument();
      expect(card).toHaveAttribute('tabIndex', '0');
    });

    it('card handles keyboard enter key', () => {
      render(<VideoCard video={mockVideo} />);

      const card = screen.getByRole('button', { name: /打开视频/i });
      fireEvent.keyDown(card, { key: 'Enter' });

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: `https://www.bilibili.com/video/${mockVideo.bvid}`,
      });
    });
  });

  describe('B站 visual style', () => {
    it('has correct CSS class for B站-style card', () => {
      render(<VideoCard video={mockVideo} />);

      const card = screen.getByRole('button', { name: /打开视频/i });
      expect(card).toHaveClass('bili-agent-video-card');
    });

    it('displays cover with correct aspect ratio container', () => {
      render(<VideoCard video={mockVideo} />);

      const card = screen.getByRole('button', { name: /打开视频/i });
      const coverContainer = within(card).getByText(mockVideo.duration).parentElement;
      expect(coverContainer).toHaveClass('bili-agent-video-card__cover');
    });
  });

  describe('Edge cases', () => {
    it('handles very long titles with ellipsis', () => {
      const longTitleVideo = {
        ...mockVideo,
        title: '这是一个非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的标题',
      };
      render(<VideoCard video={longTitleVideo} />);

      const title = screen.getByText(longTitleVideo.title);
      expect(title).toHaveClass('bili-agent-video-card__title');
    });

    it('handles zero play count', () => {
      const zeroPlayVideo = { ...mockVideo, play: 0 };
      render(<VideoCard video={zeroPlayVideo} />);

      const card = screen.getByRole('button', { name: /打开视频/i });
      // Get all stat elements and find the one with play icon
      const stats = within(card).getAllByText('0');
      expect(stats.length).toBeGreaterThanOrEqual(1);
    });

    it('handles zero favorites', () => {
      const zeroFavVideo = { ...mockVideo, favorites: 0 };
      render(<VideoCard video={zeroFavVideo} />);

      const card = screen.getByRole('button', { name: /打开视频/i });
      const stats = within(card).getAllByText('0');
      expect(stats.length).toBeGreaterThanOrEqual(1);
    });

    it('handles exact 10000 play count', () => {
      const tenKVideo = { ...mockVideo, play: 10000 };
      render(<VideoCard video={tenKVideo} />);

      expect(screen.getByText(/1万/)).toBeInTheDocument();
    });
  });
});
