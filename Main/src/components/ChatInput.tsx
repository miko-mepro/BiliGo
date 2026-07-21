import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useDraggable } from '../hooks/useDraggable.js'
import { useChat } from '../content/chat-context.js'

interface ChatInputProps {
  placeholder?: string;
}

export function ChatInput({ placeholder = '搜索你想看的视频...' }: ChatInputProps): React.ReactElement {
  const [inputValue, setInputValue] = useState('');
  const { sendMessage, stopGeneration, state } = useChat();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { position, isDragging, hasDragged, dragRef, handlePointerDown } = useDraggable();

  const buttonStyle = useMemo(
    () => ({
      translate: `${position.x}px ${position.y}px`,
      touchAction: 'none' as const,
      cursor: isDragging ? 'grabbing' : 'grab',
    }),
    [position, isDragging]
  );

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

  const handleSendClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      if (hasDragged) {
        e.preventDefault();
      }
    },
    [hasDragged]
  );

  const handleStopClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>): void => {
      if (hasDragged) {
        e.preventDefault();
        return;
      }
      stopGeneration();
    },
    [hasDragged, stopGeneration]
  );

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
            ref={dragRef as React.Ref<HTMLButtonElement>}
            className="bili-agent-chat-input__send bili-agent-chat-input__send--stop"
            onPointerDown={handlePointerDown}
            onClick={handleStopClick}
            style={buttonStyle}
            aria-label="停止生成"
            title="停止生成"
            data-draggable="send-button"
          >
            <span className="bili-agent-chat-input__stop-icon" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            ref={dragRef as React.Ref<HTMLButtonElement>}
            className="bili-agent-chat-input__send"
            disabled={isDisabled}
            onPointerDown={handlePointerDown}
            onClick={handleSendClick}
            style={buttonStyle}
            aria-label="发送消息"
            data-draggable="send-button"
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
