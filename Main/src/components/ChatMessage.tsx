import React, { useState } from 'react';
import type { ChatMessage } from '../lib/shared-types/index.js'
import type { AgentActivity } from '../content/chat-context.js'

interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
  streamingContent?: string;
  streamingReasoning?: string;
  activity?: AgentActivity | null;
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

  return (
    <div
      className={`bili-agent-message bili-agent-message--${message.role}`}
      data-role={message.role}
    >
      <div className="bili-agent-message__content">
        {isAssistant && reasoning && (
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
            {thinkingExpanded && (
              <div className="bili-agent-thinking__body" data-testid="thinking-body">
                {reasoning}
              </div>
            )}
          </div>
        )}

        {steps.length > 0 && (
          <div className="bili-agent-message__steps">
            {steps.map((step, index) => (
              <div key={`${step.timestamp}-${index}`} className="bili-agent-message__step">
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
                <span>{step.summary}</span>
              </div>
            ))}
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
