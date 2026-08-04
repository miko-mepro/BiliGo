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
  // S-2 缺口测试需要：流式推理内容
  streamingReasoning: '',
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
    streamingReasoning: '',
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
function makeVideo(
  bvid: string,
  title: string,
  overrides: Partial<BilibiliVideoCard> = {},
): BilibiliVideoCard {
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
    ...overrides,
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
    vi.useRealTimers();
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

  describe('自动滚动保护（S-2）', () => {
    function getMessageList(container: HTMLElement): HTMLDivElement {
      return container.querySelector('.bili-agent-message-list') as HTMLDivElement;
    }

    function setScrollMetrics(
      element: HTMLDivElement,
      values: { scrollTop: number; scrollHeight: number; clientHeight: number },
    ): void {
      for (const [key, value] of Object.entries(values)) {
        Object.defineProperty(element, key, { configurable: true, value });
      }
    }

    it('用户在底部时，流式内容更新会跟随滚动', () => {
      vi.useFakeTimers();
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '回答', timestamp: 1000 }],
        isLoading: true,
        streamingContent: '第一段',
      };

      const { rerender } = render(<MessageList />);
      vi.clearAllMocks();
      vi.advanceTimersByTime(100);
      mockState = { ...mockState, streamingContent: '第二段' };
      rerender(<MessageList />);

      expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it('用户上拉后，流式内容更新不会把视图拉回底部', () => {
      vi.useFakeTimers();
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '回答', timestamp: 1000 }],
        isLoading: true,
        streamingContent: '第一段',
      };

      const { container, rerender } = render(<MessageList />);
      const messageList = getMessageList(container);
      vi.clearAllMocks();
      setScrollMetrics(messageList, { scrollTop: 0, scrollHeight: 1000, clientHeight: 400 });
      fireEvent.scroll(messageList);
      vi.advanceTimersByTime(100);
      mockState = { ...mockState, streamingContent: '第二段' };
      rerender(<MessageList />);

      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    it('用户滚回底部后，自动滚动恢复', () => {
      vi.useFakeTimers();
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '回答', timestamp: 1000 }],
        isLoading: true,
        streamingContent: '第一段',
      };

      const { container, rerender } = render(<MessageList />);
      const messageList = getMessageList(container);
      setScrollMetrics(messageList, { scrollTop: 0, scrollHeight: 1000, clientHeight: 400 });
      fireEvent.scroll(messageList);
      setScrollMetrics(messageList, { scrollTop: 600, scrollHeight: 1000, clientHeight: 400 });
      fireEvent.scroll(messageList);
      vi.clearAllMocks();
      vi.advanceTimersByTime(100);
      mockState = { ...mockState, streamingContent: '第二段' };
      rerender(<MessageList />);

      expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    });

    it('流式高频更新在节流窗口内只触发一次滚动', () => {
      vi.useFakeTimers();
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '回答', timestamp: 1000 }],
        isLoading: true,
        streamingContent: '第一段',
      };

      const { rerender } = render(<MessageList />);
      vi.clearAllMocks();
      vi.advanceTimersByTime(100);
      mockState = { ...mockState, streamingContent: '第二段' };
      rerender(<MessageList />);
      mockState = { ...mockState, streamingContent: '第三段' };
      rerender(<MessageList />);

      expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    });

    // 缺口1场景B：用户上拉后收到 streamingReasoning 更新时，scrollIntoView 不应被调用
    it('用户上拉后收到 streamingReasoning 更新，不强制滚回底部', () => {
      vi.useFakeTimers();
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '回答', timestamp: 1000 }],
        isLoading: true,
        streamingContent: '第一段',
        streamingReasoning: '推理一',
      };

      const { container, rerender } = render(<MessageList />);
      const messageList = getMessageList(container);
      vi.clearAllMocks();
      setScrollMetrics(messageList, { scrollTop: 0, scrollHeight: 1000, clientHeight: 400 });
      fireEvent.scroll(messageList);
      vi.advanceTimersByTime(100);
      // 仅更新 streamingReasoning，验证用户上拉保护对其同样生效
      mockState = { ...mockState, streamingReasoning: '推理二' };
      rerender(<MessageList />);

      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    // 缺口1场景C：用户上拉后收到 videoBatches 更新（派发新批次）时，scrollIntoView 不应被调用
    it('用户上拉后收到 videoBatches 更新，不强制滚回底部', () => {
      vi.useFakeTimers();
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '回答', timestamp: 1000 }],
        isLoading: true,
        streamingContent: '第一段',
      };

      const { container, rerender } = render(<MessageList />);
      const messageList = getMessageList(container);
      vi.clearAllMocks();
      setScrollMetrics(messageList, { scrollTop: 0, scrollHeight: 1000, clientHeight: 400 });
      fireEvent.scroll(messageList);
      vi.advanceTimersByTime(100);
      // 派发新批次，验证用户上拉保护对视频批次更新同样生效
      mockState = {
        ...mockState,
        videoBatches: [makeBatch('b1', [makeVideo('BV1', '新视频')], 2000)],
      };
      rerender(<MessageList />);

      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    // 缺口2场景B：多段 reasoning 更新在 100ms 节流窗口内只触发一次滚动
    it('多段 reasoning 更新在节流窗口内只触发一次滚动', () => {
      vi.useFakeTimers();
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '回答', timestamp: 1000 }],
        isLoading: true,
        streamingContent: '第一段',
        streamingReasoning: '推理一',
      };

      const { rerender } = render(<MessageList />);
      vi.clearAllMocks();
      vi.advanceTimersByTime(100);
      // 连续 5 次 reasoning 更新，节流窗口内只允许首次触发滚动
      mockState = { ...mockState, streamingReasoning: '推理二' };
      rerender(<MessageList />);
      mockState = { ...mockState, streamingReasoning: '推理三' };
      rerender(<MessageList />);
      mockState = { ...mockState, streamingReasoning: '推理四' };
      rerender(<MessageList />);
      mockState = { ...mockState, streamingReasoning: '推理五' };
      rerender(<MessageList />);

      expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    });

    // 缺口2场景C：chunk + reasoning + videos 混合更新在节流窗口内只触发一次滚动
    it('chunk + reasoning + videos 混合更新在节流窗口内只触发一次滚动', () => {
      vi.useFakeTimers();
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '回答', timestamp: 1000 }],
        isLoading: true,
        streamingContent: '第一段',
        streamingReasoning: '推理一',
      };

      const { rerender } = render(<MessageList />);
      vi.clearAllMocks();
      vi.advanceTimersByTime(100);
      // 依次触发 streamingContent、streamingReasoning、videoBatches、streamingContent、videoBatches 混合更新
      mockState = { ...mockState, streamingContent: '第二段' };
      rerender(<MessageList />);
      mockState = { ...mockState, streamingReasoning: '推理二' };
      rerender(<MessageList />);
      mockState = {
        ...mockState,
        videoBatches: [makeBatch('b1', [makeVideo('BV1', '视频一')], 2000)],
      };
      rerender(<MessageList />);
      mockState = { ...mockState, streamingContent: '第三段' };
      rerender(<MessageList />);
      mockState = {
        ...mockState,
        videoBatches: [
          makeBatch('b1', [makeVideo('BV1', '视频一'), makeVideo('BV2', '视频二')], 2000),
        ],
      };
      rerender(<MessageList />);

      expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    });

    // 缺口2场景D：用户上拉期间 chunk、reasoning、videos 更新均不触发 scrollIntoView
    it('用户上拉期间 chunk、reasoning、videos 更新均不触发滚动', () => {
      vi.useFakeTimers();
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '回答', timestamp: 1000 }],
        isLoading: true,
        streamingContent: '第一段',
        streamingReasoning: '推理一',
      };

      const { container, rerender } = render(<MessageList />);
      const messageList = getMessageList(container);
      vi.clearAllMocks();
      setScrollMetrics(messageList, { scrollTop: 0, scrollHeight: 1000, clientHeight: 400 });
      fireEvent.scroll(messageList);
      vi.advanceTimersByTime(100);

      // 用户上拉期间，streamingContent 更新 3 次，均不应触发滚动
      mockState = { ...mockState, streamingContent: '第二段' };
      rerender(<MessageList />);
      mockState = { ...mockState, streamingContent: '第三段' };
      rerender(<MessageList />);
      mockState = { ...mockState, streamingContent: '第四段' };
      rerender(<MessageList />);

      // streamingReasoning 更新 3 次，均不应触发滚动
      mockState = { ...mockState, streamingReasoning: '推理二' };
      rerender(<MessageList />);
      mockState = { ...mockState, streamingReasoning: '推理三' };
      rerender(<MessageList />);
      mockState = { ...mockState, streamingReasoning: '推理四' };
      rerender(<MessageList />);

      // videoBatches 更新 3 次（逐批追加），均不应触发滚动
      mockState = {
        ...mockState,
        videoBatches: [makeBatch('b1', [makeVideo('BV1', '视频一')], 2000)],
      };
      rerender(<MessageList />);
      mockState = {
        ...mockState,
        videoBatches: [
          makeBatch('b1', [makeVideo('BV1', '视频一'), makeVideo('BV2', '视频二')], 2000),
        ],
      };
      rerender(<MessageList />);
      mockState = {
        ...mockState,
        videoBatches: [
          makeBatch(
            'b1',
            [makeVideo('BV1', '视频一'), makeVideo('BV2', '视频二'), makeVideo('BV3', '视频三')],
            2000,
          ),
        ],
      };
      rerender(<MessageList />);

      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });

    it('用户上拉后流结束，不强制滚回底部', () => {
      vi.useFakeTimers();
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '回答', timestamp: 1000 }],
        isLoading: true,
        streamingContent: '第一段',
      };

      const { container, rerender } = render(<MessageList />);
      const messageList = getMessageList(container);
      vi.clearAllMocks();
      setScrollMetrics(messageList, { scrollTop: 0, scrollHeight: 1000, clientHeight: 400 });
      fireEvent.scroll(messageList);
      mockState = { ...mockState, isLoading: false };
      rerender(<MessageList />);

      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    });
  });

  describe('客户端重排顺序（S-4）', () => {
    it('rerank 批次默认保持后端顺序，不被播放量排序覆盖', () => {
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '重排完成', timestamp: 1000 }],
        videoBatches: [
          makeBatch(
            'b1',
            [
              makeVideo('BV2', '后端第一', { play: 100 }),
              makeVideo('BV1', '播放量第一', { play: 900 }),
            ],
            1000,
            true,
          ),
        ],
      };

      const { container } = render(<MessageList />);
      const text = container.textContent ?? '';

      expect(text.indexOf('后端第一')).toBeLessThan(text.indexOf('播放量第一'));
    });

    it('用户手动选择播放量后，可以覆盖 rerank 顺序', () => {
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '重排完成', timestamp: 1000 }],
        videoBatches: [
          makeBatch(
            'b1',
            [
              makeVideo('BV2', '后端第一', { play: 100 }),
              makeVideo('BV1', '播放量第一', { play: 900 }),
            ],
            1000,
            true,
          ),
        ],
      };

      const { container } = render(<MessageList />);
      fireEvent.change(screen.getByLabelText(/排序/i), { target: { value: 'play' } });
      const text = container.textContent ?? '';

      expect(text.indexOf('播放量第一')).toBeLessThan(text.indexOf('后端第一'));
    });

    it('同一批次 rerank 更新时保留用户手动排序', () => {
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '搜索结果', timestamp: 1000 }],
        videoBatches: [
          makeBatch('b1', [
            makeVideo('BV1', '发布时间第一', { pubdate: 2000, play: 100 }),
            makeVideo('BV2', '播放量第一', { pubdate: 1000, play: 900 }),
          ], 1000),
        ],
      };

      const { container, rerender } = render(<MessageList />);
      fireEvent.change(screen.getByLabelText(/排序/i), { target: { value: 'pubdate' } });
      mockState = {
        ...mockState,
        videoBatches: [
          makeBatch('b1', [
            makeVideo('BV2', '播放量第一', { pubdate: 1000, play: 900 }),
            makeVideo('BV1', '发布时间第一', { pubdate: 2000, play: 100 }),
          ], 1000, true),
        ],
      };
      rerender(<MessageList />);
      const text = container.textContent ?? '';

      expect(text.indexOf('发布时间第一')).toBeLessThan(text.indexOf('播放量第一'));
    });
  });
});
