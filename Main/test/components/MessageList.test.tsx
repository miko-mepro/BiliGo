import React from 'react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MessageList } from '../../src/components/MessageList.js'

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();
import type {
  BilibiliVideoCard,
  ChatMessage,
  ClarificationRequest,
  QueryExpandResult,
  RerankResult,
  SlangUnderstandResult,
  VideoBatch,
} from '../../src/lib/shared-types/index.js'

type TimedUnderstanding = SlangUnderstandResult & { receivedAt: number };
type TimedExpansion = QueryExpandResult & { receivedAt: number };
type TimedRerank = RerankResult & { receivedAt: number };

const mockSendMessage = vi.fn();

let mockState = {
  messages: [] as ChatMessage[],
  videos: [] as BilibiliVideoCard[],
  // S-3：视频批次是渲染层的真实数据源，videos 仅为最新批次的派生镜像
  videoBatches: [] as VideoBatch[],
  isLoading: false,
  error: null,
  streamingContent: '',
  conversationId: 'test',
};

let mockInsights = {
  understandings: [] as TimedUnderstanding[],
  expansions: [] as TimedExpansion[],
  reranks: [] as TimedRerank[],
  clarification: null as ClarificationRequest | null,
};

vi.mock('../../src/content/chat-context.js', () => ({
  useChat: () => ({
    state: mockState,
    dispatch: vi.fn(),
    send: mockSendMessage,
    stop: vi.fn(),
    sendMessage: mockSendMessage,
    stopGeneration: vi.fn(),
    clearChat: vi.fn(),
    connection: null,
  }),
  useAgentInsights: () => mockInsights,
}));

function resetMocks() {
  mockSendMessage.mockClear();
  mockState = {
    messages: [],
    videos: [],
    videoBatches: [],
    isLoading: false,
    error: null,
    streamingContent: '',
    conversationId: 'test',
  };
  mockInsights = {
    understandings: [],
    expansions: [],
    reranks: [],
    clarification: null,
  };
}

/** 构造一张视频卡片，只需指定 bvid 与标题，其余字段用占位值 */
function makeVideo(bvid: string, title: string): BilibiliVideoCard {
  return {
    bvid,
    aid: 1,
    title,
    author: 'UP',
    pic: 'https://example.com/1.jpg',
    play: 1000,
    videoReview: 10,
    favorites: 5,
    duration: '3:45',
    pubdate: 1234567890,
    tag: 'tag',
    description: 'desc',
  };
}

/** 构造一个视频批次（S-3） */
function makeBatch(
  batchId: string,
  videos: BilibiliVideoCard[],
  anchorTimestamp: number,
  reranked = false,
): VideoBatch {
  return { batchId, videos, anchorTimestamp, receivedAt: anchorTimestamp, reranked };
}

describe('MessageList', () => {
  beforeEach(() => {
    resetMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders insights mixed with messages (1 understanding + 1 message)', () => {
    mockInsights = {
      understandings: [
        {
          original: 'awsl',
          normalized: '啊我死了',
          explanation: '表示极度喜爱或震惊',
          matchedDict: true,
          receivedAt: 2000,
        },
      ],
      expansions: [],
      reranks: [],
      clarification: null,
    };
    mockState = {
      ...mockState,
      messages: [
        { role: 'user', content: 'awsl', timestamp: 1000 },
      ],
    };

    render(<MessageList />);

    expect(screen.getByText('AI 理解')).toBeInTheDocument();
    expect(screen.getByText('awsl')).toBeInTheDocument();

    // Insight card is collapsed by default; expand to verify body
    fireEvent.click(screen.getByRole('button', { name: /AI 理解/ }));
    expect(screen.getByText('啊我死了')).toBeInTheDocument();
    expect(screen.getByText('表示极度喜爱或震惊')).toBeInTheDocument();
  });

  it('interleaves insights and messages by time order', () => {
    // Message at t=1000, understanding at t=2000, message at t=3000
    // Should render: user msg → understanding → assistant msg
    mockInsights = {
      understandings: [
        {
          original: '退退退',
          normalized: '退退退梗',
          explanation: '网络流行梗',
          matchedDict: true,
          receivedAt: 2000,
        },
      ],
      expansions: [],
      reranks: [],
      clarification: null,
    };
    mockState = {
      ...mockState,
      messages: [
        { role: 'user', content: '退退退', timestamp: 1000 },
        { role: 'assistant', content: '我来帮你搜索', timestamp: 3000 },
      ],
    };

    const { container } = render(<MessageList />);

    // Get all direct children of the messages container
    const messagesDiv = container.querySelector('.bili-agent-message-list__messages');
    const children = Array.from(messagesDiv!.children).filter(
      (el) => !el.classList.contains('bili-agent-message-list__no-results')
        && !(el instanceof HTMLDivElement && el.getAttribute('ref') !== null)
    );

    // Find indices of understanding card and messages
    const understandingIndex = children.findIndex(
      (el) => el.getAttribute('data-testid') === 'agent-insight-understanding'
    );
    const userMsgIndex = children.findIndex(
      (el) => el.textContent?.includes('退退退') && el.getAttribute('data-testid') !== 'agent-insight-understanding'
    );
    const assistantMsgIndex = children.findIndex(
      (el) => el.textContent?.includes('我来帮你搜索')
    );

    // Understanding should appear after user message (t=2000 > t=1000)
    expect(understandingIndex).toBeGreaterThan(userMsgIndex);
    // Understanding should appear before assistant message (t=2000 < t=3000)
    expect(understandingIndex).toBeLessThan(assistantMsgIndex);
  });

  it('renders video cards without regression (2 videos → 2 VideoCard)', () => {
    mockState = {
      ...mockState,
      messages: [
        { role: 'assistant', content: 'Here are some videos', timestamp: 1000 },
      ],
      // S-3：视频通过批次提供
      videoBatches: [
        makeBatch('b1', [makeVideo('BV1xx', 'Video One'), makeVideo('BV2yy', 'Video Two')], 1000),
      ],
    };

    render(<MessageList />);

    expect(screen.getByText('Video One')).toBeInTheDocument();
    expect(screen.getByText('Video Two')).toBeInTheDocument();
    expect(screen.getByTestId('video-grid')).toBeInTheDocument();
  });

  it('clarification onAnswer triggers sendMessage', () => {
    mockInsights = {
      understandings: [],
      expansions: [],
      reranks: [],
      clarification: {
        question: '您想找哪种内容？',
        options: ['MAD', 'AMV', '鬼畜'],
        reason: '意图不够明确',
      },
    };
    mockState = {
      ...mockState,
      messages: [
        { role: 'assistant', content: 'Need clarification', timestamp: 1000 },
      ],
    };

    render(<MessageList />);

    // clarification card is collapsed by default; expand it
    fireEvent.click(screen.getByRole('button', { name: /请帮我确认/ }));
    fireEvent.click(screen.getByRole('button', { name: 'MAD' }));

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).toHaveBeenCalledWith('MAD');
  });

  it('does not show empty state when only insights exist', () => {
    mockInsights = {
      understandings: [
        {
          original: 'test',
          normalized: 'test normalized',
          explanation: 'test explanation',
          matchedDict: false,
          receivedAt: 1000,
        },
      ],
      expansions: [],
      reranks: [],
      clarification: null,
    };

    render(<MessageList />);

    expect(screen.queryByText('搜索你想看的视频...')).not.toBeInTheDocument();
    expect(screen.getByText('AI 理解')).toBeInTheDocument();
  });

  it('shows FilterSortControls when videos exist', () => {
    mockState = {
      ...mockState,
      messages: [
        { role: 'assistant', content: 'Results', timestamp: 1000 },
      ],
      videoBatches: [makeBatch('b1', [makeVideo('BV1xx', 'Video')], 1000)],
    };

    render(<MessageList />);

    expect(screen.getByTestId('filter-sort-controls')).toBeInTheDocument();
  });

  // S-3 批次归属模型的渲染断言
  describe('视频批次渲染（S-3）', () => {
    it('两次搜索的批次都保留，旧视频不被新搜索顶掉', () => {
      mockState = {
        ...mockState,
        messages: [
          { role: 'user', content: '搜鬼畜', timestamp: 500 },
          { role: 'assistant', content: '找到了', timestamp: 1000 },
          { role: 'user', content: '搜编程', timestamp: 2500 },
          { role: 'assistant', content: '这是编程', timestamp: 3000 },
        ],
        videoBatches: [
          makeBatch('b1', [makeVideo('BV1', '鬼畜视频')], 1000),
          makeBatch('b2', [makeVideo('BV2', '编程教程')], 3000),
        ],
      };

      render(<MessageList />);

      // 两批次的视频同时存在——这是 S-3 要修复的核心行为
      expect(screen.getByText('鬼畜视频')).toBeInTheDocument();
      expect(screen.getByText('编程教程')).toBeInTheDocument();
      expect(screen.getAllByTestId('video-grid')).toHaveLength(2);
      // 每个批次有自己独立的筛选控件
      expect(screen.getAllByTestId('filter-sort-controls')).toHaveLength(2);
    });

    it('批次按 anchorTimestamp 插入消息流，旧批次排在新消息之前', () => {
      mockState = {
        ...mockState,
        messages: [
          { role: 'assistant', content: '第一次回答', timestamp: 1000 },
          { role: 'assistant', content: '第二次回答', timestamp: 3000 },
        ],
        videoBatches: [
          makeBatch('b1', [makeVideo('BV1', '旧视频')], 1000),
          makeBatch('b2', [makeVideo('BV2', '新视频')], 3000),
        ],
      };

      const { container } = render(<MessageList />);
      const text = container.textContent ?? '';

      // 渲染顺序：第一次回答 → 旧视频 → 第二次回答 → 新视频
      expect(text.indexOf('第一次回答')).toBeLessThan(text.indexOf('旧视频'));
      expect(text.indexOf('旧视频')).toBeLessThan(text.indexOf('第二次回答'));
      expect(text.indexOf('第二次回答')).toBeLessThan(text.indexOf('新视频'));
    });

    it('rerank 更新同批次时只有一个视频网格，顺序按重排结果', () => {
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '重排完成', timestamp: 1000 }],
        // rerank 走 upsert 更新同一 batchId，因此仍是单个批次
        videoBatches: [
          makeBatch(
            'b1',
            [makeVideo('BV2', '第二'), makeVideo('BV1', '第一'), makeVideo('BV3', '第三')],
            1000,
            true,
          ),
        ],
      };

      const { container } = render(<MessageList />);

      expect(screen.getAllByTestId('video-grid')).toHaveLength(1);
      const text = container.textContent ?? '';
      expect(text.indexOf('第二')).toBeLessThan(text.indexOf('第一'));
    });

    it('空批次不渲染视频网格与筛选控件', () => {
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '没有结果', timestamp: 1000 }],
        videoBatches: [makeBatch('b1', [], 1000)],
      };

      render(<MessageList />);

      expect(screen.queryByTestId('video-grid')).not.toBeInTheDocument();
      expect(screen.queryByTestId('filter-sort-controls')).not.toBeInTheDocument();
    });

    it('videoBatches 缺失时不抛错（旧状态/部分 mock 的防御性兜底）', () => {
      // 参考 R-1 教训：渲染层不能假设上游字段一定存在
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '内容', timestamp: 1000 }],
        videoBatches: undefined as unknown as VideoBatch[],
      };

      expect(() => render(<MessageList />)).not.toThrow();
    });
  });
});