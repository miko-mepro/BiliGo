import React, { useCallback } from 'react';
import type { ErrorPayload } from '../lib/shared-types/index.js'
import { useChat } from '../content/chat-context.js'

interface ErrorDisplayProps {
  error: ErrorPayload;
}

export function ErrorDisplay({ error }: ErrorDisplayProps): React.ReactElement {
  const { dispatch } = useChat();

  const handleDismiss = useCallback((): void => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, [dispatch]);

  const handleRetry = useCallback((): void => {
    dispatch({ type: 'SET_ERROR', payload: null });
    // The user can manually retry by sending a new message
  }, [dispatch]);

  const isRateLimit = String(error.code) === '429';
  const isAuthError = error.code === '401' || error.code === '403' || error.code === 'auth';
  const isProviderMissing = error.code === 'PROVIDER_NOT_CONFIGURED';
  const isNetworkError = error.code === 'NETWORK_ERROR' || !error.code;
  const title = isRateLimit
    ? '请求太频繁'
    : isAuthError || isProviderMissing
      ? 'AI 提供商配置错误'
      : isNetworkError
        ? '网络连接错误'
        : '请求失败';
  const message = error.message || (isRateLimit
    ? '请求太频繁，请稍后重试。'
    : isNetworkError
      ? '请检查网络连接后重试。'
      : '请稍后再试。');

  return (
    <div
      className={`bili-agent-error bili-agent-error--${isRateLimit ? 'rate-limit' : 'network'}`}
      role="alert"
    >
      <div className="bili-agent-error__icon">
        {isRateLimit ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        )}
      </div>

      <div className="bili-agent-error__content">
        <p className="bili-agent-error__title">
          {title}
        </p>
        <p className="bili-agent-error__message">
          {message}
        </p>
      </div>

      <div className="bili-agent-error__actions">
        <button
          className="bili-agent-error__retry"
          onClick={handleRetry}
          aria-label="重试"
        >
          重试
        </button>
        <button
          className="bili-agent-error__dismiss"
          onClick={handleDismiss}
          aria-label="关闭"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
