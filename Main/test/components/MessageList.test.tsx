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
} from '../../src/lib/shared-types/index.js'

type TimedUnderstanding = SlangUnderstandResult & { receivedAt: number };
type TimedExpansion = QueryExpandResult & { receivedAt: number };
type TimedRerank = RerankResult & { receivedAt: number };

const mockSendMessage = vi.fn();

let mockState = {
  messages: [] as ChatMessage[],
  videos: [] as BilibiliVideoCard[],
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
      videos: [
        {
          bvid: 'BV1xx',
          aid: 1,
          title: 'Video One',
          author: 'UP1',
          pic: 'https://example.com/1.jpg',
          play: 1000,
          videoReview: 10,
          favorites: 5,
          duration: '3:45',
          pubdate: 1234567890,
          tag: 'tag1',
          description: 'desc1',
        },
        {
          bvid: 'BV2yy',
          aid: 2,
          title: 'Video Two',
          author: 'UP2',
          pic: 'https://example.com/2.jpg',
          play: 2000,
          videoReview: 20,
          favorites: 10,
          duration: '5:30',
          pubdate: 1234567890,
          tag: 'tag2',
          description: 'desc2',
        },
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
      videos: [
        {
          bvid: 'BV1xx',
          aid: 1,
          title: 'Video',
          author: 'UP',
          pic: 'https://example.com/1.jpg',
          play: 1000,
          videoReview: 10,
          favorites: 5,
          duration: '3:45',
          pubdate: 1234567890,
          tag: 'tag',
          description: 'desc',
        },
      ],
    };

    render(<MessageList />);

    expect(screen.getByTestId('filter-sort-controls')).toBeInTheDocument();
  });
});