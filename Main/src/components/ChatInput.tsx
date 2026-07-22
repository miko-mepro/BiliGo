import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useChat } from '../content/chat-context.js'

interface ChatInputProps {
  placeholder?: string;
}

export function ChatInput({ placeholder = '搜索你想看的视频...' }: ChatInputProps): React.ReactElement {
  const [inputValue, setInputValue] = useState('');
  const { sendMessage, stopGeneration, state } = useChat();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 修复 #9：取消发送/停止按钮的拖拽能力。
  // 原实现把 useDraggable 的视口绝对坐标当作局部 translate 使用，
  // 按钮会被拖进面板 overflow:hidden 区域而消失（停止按钮消失=无法停止生成）。

  const handleSubmit = useCallback(
    async (e?: React.FormEvent): Promise<void> => {
      e?.preventDefault();
      
      if (!inputValue.trim() || state.isLoading) return;
      
      const message = inputValue;
      setInputValue('');
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      
      await sendMessage(message);
    },
    [inputValue, state.isLoading, sendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setInputValue(e.target.value);
    
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  // Focus textarea on mount if panel is not hidden
  useEffect(() => {
    const panel = textareaRef.current?.closest('[data-bili-agent-panel]');
    const isHidden = panel?.getAttribute('aria-hidden') === 'true';
    if (!isHidden) {
      textareaRef.current?.focus();
    }
  }, []);

  const isDisabled = !inputValue.trim();

  // 修复 #9：按钮不再可拖拽，停止按钮直接触发停止生成
  const handleStopClick = useCallback((): void => {
    stopGeneration();
  }, [stopGeneration]);

  return (
    <form className="bili-agent-chat-input" onSubmit={handleSubmit}>
      <div className="bili-agent-chat-input__container">
        <textarea
          ref={textareaRef}
          className="bili-agent-chat-input__textarea"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={state.isLoading}
          aria-label="输入消息"
        />
        {state.isLoading ? (
          <button
            type="button"
            className="bili-agent-chat-input__send bili-agent-chat-input__send--stop"
            onClick={handleStopClick}
            aria-label="停止生成"
            title="停止生成"
          >
            <span className="bili-agent-chat-input__stop-icon" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            className="bili-agent-chat-input__send"
            disabled={isDisabled}
            aria-label="发送消息"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
    </form>
  );
}
