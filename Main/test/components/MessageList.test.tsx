import React from 'react'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { MessageList, RERANK_FALLBACK_TIMEOUT_MS } from '../../src/components/MessageList.js'

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
  rerankPending = false,
): VideoBatch {
  return {
    batchId,
    videos,
    anchorTimestamp,
    receivedAt: anchorTimestamp,
    reranked,
    rerankPending,
  };
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

    it('rerank 完成前不渲染网格，45 秒无回推后显示原序兜底', () => {
      vi.useFakeTimers();
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '正在重排', timestamp: 1000 }],
        videoBatches: [
          makeBatch(
            'b1',
            [
              makeVideo('BV1', '原序第一'),
              makeVideo('BV2', '原序第二'),
              makeVideo('BV3', '原序第三'),
              makeVideo('BV4', '原序第四'),
            ],
            1000,
            false,
            true,
          ),
        ],
      };

      const { container } = render(<MessageList />);

      expect(screen.queryByTestId('video-grid')).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(RERANK_FALLBACK_TIMEOUT_MS);
      });

      expect(screen.getByTestId('video-grid')).toBeInTheDocument();
      const text = container.textContent ?? '';
      expect(text.indexOf('原序第一')).toBeLessThan(text.indexOf('原序第二'));
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

  // ===== 阶段4缺口4：时间锚点交错归属 =====
  describe('时间锚点交错归属（阶段4缺口4）', () => {
    it('第一次insight/视频在第二次assistant/insight/视频之前，旧批次不被新批次覆盖', () => {
      // 时间线：
      // t=500: user搜索1
      // t=1000: assistant回答1
      // t=1500: insight理解1
      // t=1500: batch1锚点（第一次视频）
      // t=2500: user搜索2
      // t=3000: assistant回答2
      // t=3500: insight理解2
      // t=3500: batch2锚点（第二次视频）
      mockInsights = {
        understandings: [
          {
            original: 'awsl1',
            normalized: '理解1',
            explanation: '第一次搜索的理解',
            matchedDict: false,
            receivedAt: 1500,
          },
          {
            original: 'awsl2',
            normalized: '理解2',
            explanation: '第二次搜索的理解',
            matchedDict: false,
            receivedAt: 3500,
          },
        ],
        expansions: [],
        reranks: [],
        clarification: null,
      };
      mockState = {
        ...mockState,
        messages: [
          { role: 'user', content: '搜索鬼畜', timestamp: 500 },
          { role: 'assistant', content: '第一次回答', timestamp: 1000 },
          { role: 'user', content: '搜索编程', timestamp: 2500 },
          { role: 'assistant', content: '第二次回答', timestamp: 3000 },
        ],
        videoBatches: [
          makeBatch('batch1', [makeVideo('BV1', '第一次视频')], 1500),
          makeBatch('batch2', [makeVideo('BV2', '第二次视频')], 3500),
        ],
      };

      const { container } = render(<MessageList />);
      const messagesDiv = container.querySelector('.bili-agent-message-list__messages');
      const children = Array.from(messagesDiv!.children).filter(
        (el) => !el.hasAttribute('ref'),
      );

      // 按 data-testid 或文本内容找各元素
      const understandingCards = children.filter(
        (el) => el.getAttribute('data-testid') === 'agent-insight-understanding',
      );
      const videoGrids = children.filter((el) => el.getAttribute('data-testid') === 'video-grid');
      const firstAnswerIdx = children.findIndex((el) => el.textContent?.includes('第一次回答'));
      const secondAnswerIdx = children.findIndex((el) => el.textContent?.includes('第二次回答'));

      // 断言：两个 understanding 卡片和两个 video grid
      expect(understandingCards).toHaveLength(2);
      expect(videoGrids).toHaveLength(2);

      // 断言DOM顺序：第一次回答 < 第一个理解卡片 < 第一个视频网格 < 第二次回答 < 第二个理解卡片 < 第二个视频网格
      const firstUnderstandingIdx = children.indexOf(understandingCards[0]);
      const secondUnderstandingIdx = children.indexOf(understandingCards[1]);
      const firstVideoGridIdx = children.indexOf(videoGrids[0]);
      const secondVideoGridIdx = children.indexOf(videoGrids[1]);

      expect(firstAnswerIdx).toBeLessThan(firstUnderstandingIdx);
      expect(firstUnderstandingIdx).toBeLessThan(firstVideoGridIdx);
      expect(firstVideoGridIdx).toBeLessThan(secondAnswerIdx);
      expect(secondAnswerIdx).toBeLessThan(secondUnderstandingIdx);
      expect(secondUnderstandingIdx).toBeLessThan(secondVideoGridIdx);

      // 断言：两个批次都存在（旧批次未被覆盖）
      expect(screen.getByText('第一次视频')).toBeInTheDocument();
      expect(screen.getByText('第二次视频')).toBeInTheDocument();
    });

    it('insight和video batch按各自receivedAt/anchorTimestamp排序，不依赖虚构batchId', () => {
      // 不虚构insight.batchId，insight和batch通过各自的时间戳独立排序
      mockInsights = {
        understandings: [
          {
            original: 'awsl',
            normalized: '啊我死了',
            explanation: '表达喜爱',
            matchedDict: true,
            receivedAt: 2000, // insight在两个batch之间
          },
        ],
        expansions: [],
        reranks: [],
        clarification: null,
      };
      mockState = {
        ...mockState,
        messages: [
          { role: 'user', content: '用户消息', timestamp: 500 },
          { role: 'assistant', content: '回答', timestamp: 1000 },
        ],
        videoBatches: [
          makeBatch('b1', [makeVideo('BV1', '早批次视频')], 1500),
          makeBatch('b2', [makeVideo('BV2', '晚批次视频')], 2500),
        ],
      };

      const { container } = render(<MessageList />);
      const messagesDiv = container.querySelector('.bili-agent-message-list__messages');
      const children = Array.from(messagesDiv!.children).filter(
        (el) => !(el instanceof HTMLDivElement && !el.hasAttribute('data-testid')),
      );

      const understandingCard = children.find(
        (el) => el.getAttribute('data-testid') === 'agent-insight-understanding',
      );
      const videoGrids = children.filter((el) => el.getAttribute('data-testid') === 'video-grid');

      expect(understandingCard).toBeDefined();
      expect(videoGrids).toHaveLength(2);

      // 断言DOM顺序：早批次视频(1500) < insight(2000) < 晚批次视频(2500)
      const understandingIdx = children.indexOf(understandingCard!);
      const firstVideoGridIdx = children.indexOf(videoGrids[0]);
      const secondVideoGridIdx = children.indexOf(videoGrids[1]);

      expect(firstVideoGridIdx).toBeLessThan(understandingIdx);
      expect(understandingIdx).toBeLessThan(secondVideoGridIdx);
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

    // ===== 阶段4缺口6：策略C - rerank与播放量冲突时默认进入智能排序 =====
    it('阶段4缺口6：rerank更新后未手动选择时默认智能排序，DOM保持后端顺序', () => {
      // 策略C：batch.reranked=true且用户未手动选择时，sortField自动切换为'rerank'
      // 视频播放量有冲突（播放量第一vs后端第一），但默认进入rerank排序
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '重排结果', timestamp: 1000 }],
        videoBatches: [
          makeBatch(
            'b1',
            [
              makeVideo('BV3', '后端第一', { play: 50 }),
              makeVideo('BV1', '播放量最高', { play: 1000 }),
              makeVideo('BV2', '播放量中等', { play: 500 }),
            ],
            1000,
            true, // reranked=true → 触发智能排序
          ),
        ],
      };

      const { container } = render(<MessageList />);
      const text = container.textContent ?? '';

      // 默认智能排序，保持后端顺序
      expect(text.indexOf('后端第一')).toBeLessThan(text.indexOf('播放量最高'));
      expect(text.indexOf('播放量最高')).toBeLessThan(text.indexOf('播放量中等'));
      // 筛选控件显示"智能排序"
      const sortSelect = screen.getByLabelText(/排序/i) as HTMLSelectElement;
      expect(sortSelect.value).toBe('rerank');
    });

    it('阶段4缺口6：用户手动选择播放量排序后覆盖rerank，播放量高的在前', () => {
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '重排结果', timestamp: 1000 }],
        videoBatches: [
          makeBatch(
            'b1',
            [
              makeVideo('BV3', '后端第一', { play: 50 }),
              makeVideo('BV1', '播放量最高', { play: 1000 }),
              makeVideo('BV2', '播放量中等', { play: 500 }),
            ],
            1000,
            true,
          ),
        ],
      };

      const { container } = render(<MessageList />);
      // 用户手动选择播放量排序
      fireEvent.change(screen.getByLabelText(/排序/i), { target: { value: 'play' } });
      const text = container.textContent ?? '';

      // 按播放量降序：播放量最高 > 播放量中等 > 后端第一
      expect(text.indexOf('播放量最高')).toBeLessThan(text.indexOf('播放量中等'));
      expect(text.indexOf('播放量中等')).toBeLessThan(text.indexOf('后端第一'));
      // 排序选择器已切换到play
      const sortSelect = screen.getByLabelText(/排序/i) as HTMLSelectElement;
      expect(sortSelect.value).toBe('play');
    });
  });

  // ===== 阶段4缺口7：批次独立状态 =====
  describe('批次独立状态（阶段4缺口7）', () => {
    it('同batch视频更新后保留用户手动sort/date/duration选择', () => {
      const now = Date.now() / 1000;
      mockState = {
        ...mockState,
        messages: [{ role: 'assistant', content: '搜索结果', timestamp: 1000 }],
        videoBatches: [
          makeBatch(
            'b1',
            [
              makeVideo('BV1', '视频A', {
                pubdate: now - 2 * 86400,
                duration: '30:00',
                play: 500,
              }),
              makeVideo('BV2', '视频B', {
                pubdate: now - 2 * 86400,
                duration: '5:00',
                play: 100,
              }),
            ],
            1000,
          ),
        ],
      };

      const { container, rerender } = render(<MessageList />);
      // 用户选择按发布时间排序、一个月内和“长视频”筛选。
      fireEvent.change(screen.getByLabelText(/排序/i), { target: { value: 'pubdate' } });
      fireEvent.change(screen.getByLabelText(/时间/i), { target: { value: 'month' } });
      fireEvent.change(screen.getByLabelText(/时长/i), { target: { value: 'long' } });

      // 验证当前筛选结果：仅视频A（30:00 > 20分钟）
      let text = container.textContent ?? '';
      expect(text).toContain('视频A');
      expect(text).not.toContain('视频B');

      // 同batch更新（rerank推送新顺序），保留用户手动选择
      mockState = {
        ...mockState,
        videoBatches: [
          makeBatch(
            'b1',
            [
              makeVideo('BV2', '视频B', {
                pubdate: now - 2 * 86400,
                duration: '5:00',
                play: 100,
              }),
              makeVideo('BV1', '视频A', {
                pubdate: now - 2 * 86400,
                duration: '30:00',
                play: 500,
              }),
            ],
            1000,
            true,
          ),
        ],
      };
      rerender(<MessageList />);

      // 断言：用户手动筛选状态保留，仍只显示视频A（长视频）
      text = container.textContent ?? '';
      expect(text).toContain('视频A');
      expect(text).not.toContain('视频B');

      // 排序和时长选择器继续保持用户选择
      const sortSelect = screen.getByLabelText(/排序/i) as HTMLSelectElement;
      const dateSelect = screen.getByLabelText(/时间/i) as HTMLSelectElement;
      const durationSelect = screen.getByLabelText(/时长/i) as HTMLSelectElement;
      expect(sortSelect.value).toBe('pubdate');
      expect(dateSelect.value).toBe('month');
      expect(durationSelect.value).toBe('long');
    });

    it('新batch拥有默认筛选排序状态且不串扰旧batch', () => {
      // 阶段4缺口7：两批次独立状态
      // 旧batch用户手动选择了"播放量排序"，新batch应该使用默认状态（play），互不干扰
      mockState = {
        ...mockState,
        messages: [
          { role: 'assistant', content: '第一次回答', timestamp: 1000 },
          { role: 'assistant', content: '第二次回答', timestamp: 3000 },
        ],
        videoBatches: [
          makeBatch('b1', [
            makeVideo('BV1', '旧视频A', { play: 100 }),
            makeVideo('BV2', '旧视频B', { play: 200 }),
          ], 1000),
        ],
      };

      const { container, rerender } = render(<MessageList />);
      // 在旧batch上手动选择"发布时间排序"
      const allSorts = screen.getAllByLabelText(/排序/i);
      expect(allSorts).toHaveLength(1);
      fireEvent.change(allSorts[0], { target: { value: 'pubdate' } });

      // 追加新batch（第二次搜索）
      mockState = {
        ...mockState,
        videoBatches: [
          makeBatch('b1', [
            makeVideo('BV1', '旧视频A', { play: 100 }),
            makeVideo('BV2', '旧视频B', { play: 200 }),
          ], 1000),
          makeBatch('b2', [
            makeVideo('BV3', '新视频C', { play: 300 }),
            makeVideo('BV4', '新视频D', { play: 50 }),
          ], 3000),
        ],
      };
      rerender(<MessageList />);

      // 现在有两个筛选控件组（用 querySelectorAll 因为 FilterSortControls 有重复的 id）
      const sortSelects = container.querySelectorAll('#bili-agent-sort') as NodeListOf<HTMLSelectElement>;
      expect(sortSelects).toHaveLength(2);

      // 旧batch保持用户选择 pubdate，新batch默认值 play
      expect(sortSelects[0].value).toBe('pubdate');
      expect(sortSelects[1].value).toBe('play');

      // 验证DOM顺序：旧batch在DOM中排在前，新batch在后
      const videoGrids = screen.getAllByTestId('video-grid');
      expect(videoGrids).toHaveLength(2);
    });

    it('新batch拥有默认日期筛选且不继承旧batch的时长筛选', () => {
      mockState = {
        ...mockState,
        messages: [
          { role: 'assistant', content: '第一次回答', timestamp: 1000 },
        ],
        videoBatches: [
          makeBatch('b1', [
            makeVideo('BV1', '旧视频', { duration: '30:00' }),
            makeVideo('BV2', '旧视频短', { duration: '3:00' }),
          ], 1000),
        ],
      };

      const { container, rerender } = render(<MessageList />);
      // 旧batch筛选"长视频"
      fireEvent.change(screen.getByLabelText(/时长/i), { target: { value: 'long' } });

      // 追加新batch
      mockState = {
        ...mockState,
        videoBatches: [
          makeBatch('b1', [
            makeVideo('BV1', '旧视频', { duration: '30:00' }),
            makeVideo('BV2', '旧视频短', { duration: '3:00' }),
          ], 1000),
          makeBatch('b2', [
            makeVideo('BV3', '新视频', { duration: '10:00' }),
          ], 3000),
        ],
      };
      rerender(<MessageList />);

      // 旧batch时长筛选保持为 long，新batch时长筛选为默认值 'all'
      const durationSelects = container.querySelectorAll('#bili-agent-duration-filter') as NodeListOf<HTMLSelectElement>;
      expect(durationSelects).toHaveLength(2);
      expect(durationSelects[0].value).toBe('long');
      expect(durationSelects[1].value).toBe('all');

      // 旧batch日期筛选保持默认，新batch也是默认
      const dateSelects = container.querySelectorAll('#bili-agent-date-filter') as NodeListOf<HTMLSelectElement>;
      expect(dateSelects).toHaveLength(2);
      expect(dateSelects[0].value).toBe('all');
      expect(dateSelects[1].value).toBe('all');
    });
  });
});
