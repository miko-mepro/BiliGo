import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useChat, useAgentInsights } from '../content/chat-context.js'
import type { TimedUnderstanding, TimedExpansion, TimedRerank } from '../content/chat-context.js'
import { ChatMessageItem } from './ChatMessage.js'
import { ErrorDisplay } from './ErrorDisplay.js'
import { VideoCard } from './VideoCard.js'
import { FilterSortControls } from './FilterSortControls.js'
import { AgentInsightCard } from './AgentInsightCard.js'
import { applySortAndFilter } from '../utils/sort-filter.js'
import type { BilibiliVideoCard, ChatMessage } from '../lib/shared-types/index.js'
import type { SortField, DateFilter, DurationFilter } from '../utils/sort-filter.js'

interface MessageListProps {
  emptyStateText?: string;
  videos?: BilibiliVideoCard[];
}

/** Render items are merged from messages + insights, sorted by arrival time. */
type RenderItem =
  | { type: 'message'; message: ChatMessage; index: number; isStreaming: boolean; streamingContent: string }
  | { type: 'understanding'; data: TimedUnderstanding }
  | { type: 'expansion'; data: TimedExpansion }
  | { type: 'rerank'; data: TimedRerank };

function getRenderItemTime(item: RenderItem): number {
  switch (item.type) {
    case 'message': return item.message.timestamp;
    case 'understanding': return item.data.receivedAt;
    case 'expansion': return item.data.receivedAt;
    case 'rerank': return item.data.receivedAt;
  }
}

export function MessageList({
  emptyStateText = '搜索你想看的视频...',
  videos: providedVideos,
}: MessageListProps): React.ReactElement {
  const { state, sendMessage } = useChat();
  const { understandings, expansions, reranks, clarification } = useAgentInsights();
  const videos = providedVideos ?? state.videos;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Local filter/sort state — resets with each conversation (not persisted)
  const [sortField, setSortField] = useState<SortField>('play');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');

  // Reset filters when videos change (new search results)
  useEffect(() => {
    setSortField('play');
    setDateFilter('all');
    setDurationFilter('all');
  }, [videos.length]);

  // Apply sort and filter client-side
  const processedVideos = useMemo(() => {
    return applySortAndFilter(videos, sortField, dateFilter, durationFilter);
  }, [videos, sortField, dateFilter, durationFilter]);

  // Merge messages + insights into time-ordered render items
  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    const lastMsgIndex = state.messages.length - 1;

    state.messages.forEach((message, index) => {
      const isLast = index === lastMsgIndex;
      items.push({
        type: 'message',
        message,
        index,
        isStreaming: isLast && state.isLoading && message.role === 'assistant',
        streamingContent: isLast && state.isLoading ? state.streamingContent : '',
      });
    });

    understandings.forEach((data) => {
      items.push({ type: 'understanding', data });
    });
    expansions.forEach((data) => {
      items.push({ type: 'expansion', data });
    });
    reranks.forEach((data) => {
      items.push({ type: 'rerank', data });
    });

    items.sort((a, b) => getRenderItemTime(a) - getRenderItemTime(b));
    return items;
  }, [state.messages, understandings, expansions, reranks, state.isLoading, state.streamingContent]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [renderItems.length, state.streamingContent, state.streamingReasoning, videos]);

  const hasMessages = state.messages.length > 0;
  const hasVideos = videos.length > 0;
  const hasProcessedVideos = processedVideos.length > 0;
  const hasInsights =
    understandings.length > 0 ||
    expansions.length > 0 ||
    reranks.length > 0 ||
    clarification !== null;

  function renderInsightItem(item: RenderItem, idx: number): React.ReactElement {
    switch (item.type) {
      case 'understanding':
        return <AgentInsightCard key={`u-${idx}-${item.data.receivedAt}`} kind="understanding" data={item.data} />;
      case 'expansion':
        return <AgentInsightCard key={`e-${idx}-${item.data.receivedAt}`} kind="expansion" data={item.data} />;
      case 'rerank':
        return <AgentInsightCard key={`r-${idx}-${item.data.receivedAt}`} kind="rerank" data={item.data} />;
      default:
        // Messages are rendered separately below
        return <></>;
    }
  }

  return (
    <div ref={containerRef} className="bili-agent-message-list">
      {!hasMessages && !hasVideos && !hasInsights ? (
        <div className="bili-agent-message-list__empty">
          <div className="bili-agent-message-list__empty-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <p className="bili-agent-message-list__empty-text">{emptyStateText}</p>
          <p className="bili-agent-message-list__empty-hint">
            我是你的B站AI助手，可以帮你搜索视频、总结内容、推荐内容等。
          </p>
        </div>
      ) : (
        <>
          <div className="bili-agent-message-list__messages">
            {renderItems.map((item, idx) => {
              if (item.type === 'message') {
                return (
                  <ChatMessageItem
                    key={`msg-${item.message.timestamp}-${item.index}`}
                    message={item.message}
                    isStreaming={item.isStreaming}
                    streamingContent={item.streamingContent}
                    streamingReasoning={item.isStreaming ? state.streamingReasoning : ''}
                    activity={item.isStreaming ? state.activity : null}
                  />
                );
              }
              return renderInsightItem(item, idx);
            })}

            {hasVideos && (
              <FilterSortControls
                sortField={sortField}
                dateFilter={dateFilter}
                durationFilter={durationFilter}
                onSortChange={setSortField}
                onDateFilterChange={setDateFilter}
                onDurationFilterChange={setDurationFilter}
              />
            )}

            {hasProcessedVideos && (
              <div className="bili-agent-video-grid" data-testid="video-grid">
                {processedVideos.map((video) => (
                  <VideoCard key={video.bvid} video={video} />
                ))}
              </div>
            )}

            {hasVideos && !hasProcessedVideos && (
              <div className="bili-agent-message-list__no-results" data-testid="no-results">
                <p>没有符合筛选条件的视频</p>
              </div>
            )}

            {clarification && (
              <AgentInsightCard
                kind="clarification"
                data={clarification}
                onAnswer={(option) => sendMessage(option)}
              />
            )}

            <div ref={messagesEndRef} />
          </div>

          {state.error && <ErrorDisplay error={state.error} />}
        </>
      )}
    </div>
  );
}