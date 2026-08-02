import React, { useState } from 'react';
import type { ChatMessage, AgentStep } from '../lib/shared-types/index.js'
import type { AgentActivity } from '../content/chat-context.js'

interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
  streamingContent?: string;
  streamingReasoning?: string;
  activity?: AgentActivity | null;
}

/**
 * 工具名中文映射：思维栏时间线中把内部工具名显示为用户可读的中文标签。
 * 未知工具名回退为原名。
 */
const TOOL_NAME_LABELS: Record<string, string> = {
  slang_understand: '理解黑话',
  query_expand: '扩展查询',
  bilibili_search: '搜索视频',
  video_rerank: '智能重排',
  ask_clarification: '追问澄清',
};

function toolLabel(name: string): string {
  return TOOL_NAME_LABELS[name] ?? name;
}

/**
 * 把 reasoning + steps 时间线拼成折叠态预览用的纯文本。
 * 顺序：原生 reasoning 在前，之后按 steps 顺序追加
 * （note 取全文，tool_call 取中文标签），用空格连接成一段连续文本，
 * CSS 只露出最后 1.5 行，实现"尾部预览"。
 */
function buildPreviewText(reasoning: string, steps: AgentStep[]): string {
  const parts: string[] = [];
  if (reasoning) parts.push(reasoning);
  for (const step of steps) {
    if (step.type === 'note') {
      parts.push(step.summary);
    } else {
      parts.push(`⚙ ${toolLabel(step.name)}`);
    }
  }
  return parts.join(' ');
}

export function ChatMessageItem({
  message,
  isStreaming = false,
  streamingContent = '',
  streamingReasoning = '',
  activity = null,
}: ChatMessageProps): React.ReactElement {
  const isAssistant = message.role === 'assistant';
  const [thinkingExpanded, setThinkingExpanded] = useState(false);

  // For the last assistant message that's being streamed, show streaming content
  const displayContent = isStreaming && isAssistant ? streamingContent : message.content;
  const reasoning = isStreaming && isAssistant ? streamingReasoning : (message.reasoning ?? '');
  const steps = isAssistant ? (message.steps ?? []) : [];
  const isThinkingLive = isStreaming && isAssistant && activity?.kind === 'thinking' && reasoning.length > 0;
  const showRunning = isStreaming && isAssistant;
  // 思维栏显示条件：有原生 reasoning 或有步骤时间线（note/tool_call）任一即显示
  const hasThinking = isAssistant && (reasoning.length > 0 || steps.length > 0);
  const previewText = hasThinking ? buildPreviewText(reasoning, steps) : '';

  return (
    <div
      className={`bili-agent-message bili-agent-message--${message.role}`}
      data-role={message.role}
    >
      <div className="bili-agent-message__content">
        {hasThinking && (
          <div className="bili-agent-thinking">
            <button
              type="button"
              className="bili-agent-thinking__toggle"
              aria-expanded={thinkingExpanded}
              onClick={() => setThinkingExpanded((expanded) => !expanded)}
            >
              <span
                className={`bili-agent-thinking__caret${thinkingExpanded ? ' bili-agent-thinking__caret--open' : ''}`}
                aria-hidden="true"
              >
                ▸
              </span>
              <span className={`bili-agent-thinking__title${isThinkingLive ? ' bili-agent-thinking__title--live' : ''}`}>
                {isThinkingLive ? '正在深度思考…' : '思考过程'}
              </span>
              <span className="bili-agent-thinking__hint">{thinkingExpanded ? '收起' : '展开'}</span>
            </button>
            {/* 折叠态：1.5 行尾部预览 + 顶部半透明渐变遮罩，点击可展开 */}
            {!thinkingExpanded && previewText && (
              <div
                className="bili-agent-thinking__preview"
                data-testid="thinking-preview"
                role="button"
                tabIndex={0}
                onClick={() => setThinkingExpanded(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setThinkingExpanded(true);
                }}
              >
                <span className="bili-agent-thinking__preview-text">{previewText}</span>
              </div>
            )}
            {/* 展开态：完整思考时间线（reasoning + note 段落 + 工具胶囊按时间顺序） */}
            {thinkingExpanded && (
              <div className="bili-agent-thinking__body" data-testid="thinking-body">
                {reasoning && (
                  <div className="bili-agent-thinking__reasoning">{reasoning}</div>
                )}
                {steps.map((step, index) =>
                  step.type === 'note' ? (
                    <div
                      key={`${step.timestamp}-${index}`}
                      className="bili-agent-thinking__note"
                    >
                      {step.summary}
                    </div>
                  ) : (
                    <div
                      key={`${step.timestamp}-${index}`}
                      className={`bili-agent-thinking__step${step.status === 'running' ? ' bili-agent-thinking__step--running' : ''}`}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                      </svg>
                      <span>{toolLabel(step.name)}</span>
                      {step.status === 'running' && (
                        <span className="bili-agent-thinking__step-status">进行中…</span>
                      )}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        )}

        {displayContent && (
          <div className="bili-agent-message__bubble">
            <p className="bili-agent-message__text">{displayContent}</p>
          </div>
        )}

        {showRunning && (
          <div className="bili-agent-running" data-testid="agent-running">
            <span className="bili-agent-running__dots" aria-hidden="true">
              <span className="bili-agent-running__dot" />
              <span className="bili-agent-running__dot" />
              <span className="bili-agent-running__dot" />
            </span>
            <span className="bili-agent-running__label">{activityLabel(activity)}</span>
          </div>
        )}

        {!showRunning && (
          <span className="bili-agent-message__time">
            {formatTime(message.timestamp)}
          </span>
        )}
      </div>
    </div>
  );
}

function activityLabel(activity: AgentActivity | null): string {
  if (!activity) {
    return '正在处理…';
  }
  switch (activity.kind) {
    case 'thinking':
      return '正在思考…';
    case 'tool':
      return activity.label ? `正在${activity.label}…` : '正在调用工具…';
    case 'responding':
      return '正在回复…';
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
