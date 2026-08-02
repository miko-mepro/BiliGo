import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useChat, useAgentInsights } from '../content/chat-context.js'
import type { TimedUnderstanding, TimedExpansion, TimedRerank } from '../content/chat-context.js'
import { ChatMessageItem } from './ChatMessage.js'
import { ErrorDisplay } from './ErrorDisplay.js'
import { VideoCard } from './VideoCard.js'
import { FilterSortControls } from './FilterSortControls.js'
import { AgentInsightCard } from './AgentInsightCard.js'
import { applySortAndFilter } from '../utils/sort-filter.js'
import type { BilibiliVideoCard, ChatMessage, VideoBatch } from '../lib/shared-types/index.js'
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
  | { type: 'rerank'; data: TimedRerank }
  // 视频批次项（S-3）：按 anchorTimestamp 插入消息流，使旧视频留在旧输出下
  | { type: 'video-batch'; batch: VideoBatch };

function getRenderItemTime(item: RenderItem): number {
  switch (item.type) {
    case 'message': return item.message.timestamp;
    case 'understanding': return item.data.receivedAt;
    case 'expansion': return item.data.receivedAt;
    case 'rerank': return item.data.receivedAt;
    // 批次锚点即其在消息流中的排序键
    case 'video-batch': return item.batch.anchorTimestamp;
  }
}

/**
 * 单个视频批次块（S-3）：渲染该批次的筛选排序控件 + 视频网格。
 *
 * 筛选/排序状态按批次独立维护——用户对旧批次的排序不应影响新批次。
 * 状态随组件挂载而生，批次被清空时随之销毁，无需额外重置 effect：
 * 每个批次由稳定的 batchId 作为 key，新批次挂载新组件即得到全新默认状态。
 */
function VideoBatchBlock({ batch }: { batch: VideoBatch }): React.ReactElement | null {
  const [sortField, setSortField] = useState<SortField>('play');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');

  const processedVideos = useMemo(() => {
    return applySortAndFilter(batch.videos, sortField, dateFilter, durationFilter);
  }, [batch.videos, sortField, dateFilter, durationFilter]);

  if (batch.videos.length === 0) return null;

  return (
    <>
      <FilterSortControls
        sortField={sortField}
        dateFilter={dateFilter}
        durationFilter={durationFilter}
        onSortChange={setSortField}
        onDateFilterChange={setDateFilter}
        onDurationFilterChange={setDurationFilter}
      />
      {processedVideos.length > 0 ? (
        <div className="bili-agent-video-grid" data-testid="video-grid">
          {processedVideos.map((video) => (
            <VideoCard key={video.bvid} video={video} />
          ))}
        </div>
      ) : (
        <div className="bili-agent-message-list__no-results" data-testid="no-results">
          <p>没有符合筛选条件的视频</p>
        </div>
      )}
    </>
  );
}

export function MessageList({
  emptyStateText = '搜索你想看的视频...',
  videos: providedVideos,
}: MessageListProps): React.ReactElement {
  const { state, sendMessage } = useChat();
  const { understandings, expansions, reranks, clarification } = useAgentInsights();
  // 视频批次（S-3）：providedVideos 是测试/外部注入的兼容入口，
  // 提供时包装为单个临时批次，锚点取 0 使其排在消息流最前。
  const videoBatches = useMemo<VideoBatch[]>(() => {
    if (providedVideos) {
      return providedVideos.length > 0
        ? [{
            batchId: 'provided',
            videos: providedVideos,
            anchorTimestamp: 0,
            receivedAt: 0,
            reranked: false,
          }]
        : [];
    }
    // 防御性兜底（参考 R-1 教训）：state 可能来自旧版本持久化数据或外部注入的
    // 部分 mock，videoBatches 缺失时降级为空数组，不在 render 阶段抛 TypeError。
    return state.videoBatches ?? [];
  }, [providedVideos, state.videoBatches]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 筛选/排序状态已下沉到 VideoBatchBlock（S-3）：每个批次独立维护，
  // 因此这里不再有全局 sortField/dateFilter/durationFilter，
  // 也不需要「videos 变化时重置筛选」的 effect——新批次挂载新组件即为默认状态。

  // Merge messages + insights + video batches into time-ordered render items
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
    // 视频批次并入渲染项（S-3），由 anchorTimestamp 决定其在消息流中的位置
    videoBatches.forEach((batch) => {
      items.push({ type: 'video-batch', batch });
    });

    items.sort((a, b) => getRenderItemTime(a) - getRenderItemTime(b));
    return items;
  }, [state.messages, understandings, expansions, reranks, videoBatches, state.isLoading, state.streamingContent]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [renderItems.length, state.streamingContent, state.streamingReasoning, videoBatches]);

  const hasMessages = state.messages.length > 0;
  const hasVideos = videoBatches.some((batch) => batch.videos.length > 0);
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
            if (item.type === 'video-batch') {
              // 视频批次内联渲染（S-3）：以 batchId 为 key，
              // 使同批次的 rerank 更新复用组件实例（保留用户筛选选择），
              // 新批次挂载新实例（得到默认筛选状态）
              return <VideoBatchBlock key={`batch-${item.batch.batchId}`} batch={item.batch} />;
            }
            return renderInsightItem(item, idx);
          })}

          {clarification && (
            <AgentInsightCard
              kind="clarification"
              data={clarification}
              onAnswer={(option) => sendMessage(option)}
            />
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* 修复 #7：错误提示移到空态/非空态分支之外，空会话断线时也能看到错误信息 */}
      {state.error && <ErrorDisplay error={state.error} />}
    </div>
  );
}