import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ToggleButtonRect } from './ToggleButton.js'
import { useDraggable } from '../hooks/useDraggable.js'
import { useResizable } from '../hooks/useResizable.js'
import { ChatProvider, useChat } from '../content/chat-context.js'
import { ChatInput } from './ChatInput.js'
import { MessageList } from './MessageList.js'
import { SettingsPanel } from '../content/settings-panel.js'
import type { ConversationRecord } from '../lib/shared-types/index.js'
import {
  readBiliAgentSettings,
  type BiliAgentSettings,
} from '../config/settings.js'

interface PanelSize {
  width: number;
  height: number;
}

interface PanelPosition {
  x: number;
  y: number;
}

interface PanelProps {
  isOpen: boolean;
  toggleButtonRect?: ToggleButtonRect | null;
  onClose?: () => void;
  onInteractionStateChange?: (isInteracting: boolean) => void;
  // 🆕 历史功能回调（integration 分支注入；ui-layer 提供 stub 默认值）
  onNewChat?: () => void;
  historyCallbacks?: {
    getIndex: () => Promise<ConversationRecord[]>;
    loadConversation: (id: string) => Promise<void>;
    deleteConversation: (id: string) => Promise<void>;
    updateTitle: (id: string, newTitle: string) => Promise<void>;
    clearAll: () => Promise<void>;
  };
}

const PANEL_GAP = 8;
const PANEL_MIN_WIDTH = 280;
const PANEL_MIN_HEIGHT = 300;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, value), max);
}

export function computePanelSize(baseSize: PanelSize, gap: number = PANEL_GAP): PanelSize {
  if (typeof window === 'undefined') {
    return baseSize;
  }

  return {
    width: Math.max(PANEL_MIN_WIDTH, Math.min(baseSize.width, window.innerWidth - gap * 2)),
    height: Math.max(PANEL_MIN_HEIGHT, Math.min(baseSize.height, window.innerHeight - gap * 2)),
  };
}

export function computePanelPosition(
  buttonRect: ToggleButtonRect | null | undefined,
  panelSize: PanelSize,
  gap: number = PANEL_GAP,
): PanelPosition {
  if (typeof window === 'undefined' || !buttonRect) {
    return { x: 0, y: 40 };
  }

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const panelWidth = Math.min(panelSize.width, viewportW - gap * 2);
  const panelHeight = Math.min(panelSize.height, viewportH - gap * 2);
  const spaceRight = viewportW - buttonRect.right - gap;
  const spaceLeft = buttonRect.left - gap;
  let x: number;

  if (spaceRight >= panelWidth) {
    x = buttonRect.right + gap;
  } else if (spaceLeft >= panelWidth) {
    x = buttonRect.left - panelWidth - gap;
  } else {
    x = spaceRight >= spaceLeft ? viewportW - panelWidth - gap : gap;
  }

  let y = buttonRect.top;
  if (y + panelHeight > viewportH - gap) {
    y = Math.max(gap, viewportH - panelHeight - gap);
  }

  return {
    x: clamp(x, gap, Math.max(gap, viewportW - panelWidth - gap)),
    y: clamp(y, gap, Math.max(gap, viewportH - panelHeight - gap)),
  };
}

export function Panel({
  isOpen,
  toggleButtonRect,
  onClose,
  onInteractionStateChange,
  onNewChat,
  historyCallbacks,
}: PanelProps): React.ReactElement {
  const className = `bili-agent-panel${isOpen ? ' bili-agent-panel--open' : ''}`;
  const [activeView, setActiveView] = useState<'chat' | 'settings'>('chat');
  const isSettingsOpen = activeView === 'settings';
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [storedPosition, setStoredPosition] = useState<PanelPosition | null>(null);
  const [storedSize, setStoredSize] = useState<PanelSize | null>(null);
  const [storedAnchorRect, setStoredAnchorRect] = useState<ToggleButtonRect | null>(null);

  useEffect(() => {
    chrome.storage.local
      .get(['bili-agent-panel-position', 'bili-agent-panel-size', 'bili-agent-panel-anchor-rect'])
      .then((result) => {
        const pos = result['bili-agent-panel-position'] as PanelPosition | undefined;
        const sz = result['bili-agent-panel-size'] as PanelSize | undefined;
        const anchor = result['bili-agent-panel-anchor-rect'] as ToggleButtonRect | undefined;
        setStoredPosition(pos ?? null);
        setStoredSize(sz ?? null);
        setStoredAnchorRect(anchor ?? null);
      });
  }, []);

  const defaultSize = useMemo(() => {
    if (typeof window === 'undefined') {
      return { width: 380, height: 600 };
    }

    return computePanelSize({
      width: 380,
      height: window.innerHeight - 80,
    });
  }, []);

  const initialSize = useMemo(() => computePanelSize(storedSize ?? defaultSize), [defaultSize, storedSize]);

  const hasButtonMovedSignificantly = useMemo(() => {
    if (!toggleButtonRect || !storedAnchorRect) {
      return false;
    }

    const currentCenterX = toggleButtonRect.left + toggleButtonRect.width / 2;
    const currentCenterY = toggleButtonRect.top + toggleButtonRect.height / 2;
    const storedCenterX = storedAnchorRect.left + storedAnchorRect.width / 2;
    const storedCenterY = storedAnchorRect.top + storedAnchorRect.height / 2;

    return Math.hypot(currentCenterX - storedCenterX, currentCenterY - storedCenterY) > 96;
  }, [storedAnchorRect, toggleButtonRect]);

  const defaultPosition = useMemo(() => {
    if (toggleButtonRect) {
      return computePanelPosition(toggleButtonRect, initialSize);
    }

    if (typeof window === 'undefined') {
      return { x: 0, y: 40 };
    }

    return {
      x: window.innerWidth - initialSize.width - 16,
      y: 40,
    };
  }, [initialSize, toggleButtonRect]);

  const initialPosition = storedPosition && !hasButtonMovedSignificantly ? storedPosition : defaultPosition;

  const handleDragEnd = useCallback(
    (pos: { x: number; y: number }) => {
      onInteractionStateChange?.(false);
      chrome.storage.local.set({ 'bili-agent-panel-position': pos });

      const anchorRect = toggleButtonRect ?? storedAnchorRect;
      if (anchorRect) {
        chrome.storage.local.set({ 'bili-agent-panel-anchor-rect': anchorRect });
      }
    },
    [onInteractionStateChange, storedAnchorRect, toggleButtonRect],
  );

  const handleResizeEnd = useCallback(
    (size: { width: number; height: number }) => {
      onInteractionStateChange?.(false);
      chrome.storage.local.set({ 'bili-agent-panel-size': size });
    },
    [onInteractionStateChange],
  );

  const dragHandleRef = useRef<HTMLDivElement>(null);

  const { position, isDragging, dragRef, handlePointerDown } = useDraggable({
    enabled: isOpen,
    handleRef: dragHandleRef,
    initialPosition,
    onDragStart: () => onInteractionStateChange?.(true),
    onDragEnd: handleDragEnd,
  });

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, textarea, select, [data-no-drag]')) {
        return;
      }
      handlePointerDown(e);
    },
    [handlePointerDown],
  );

  const { size, resizeHandles, minWidth, minHeight, maxWidth, maxHeight, resizeByKeyboard } = useResizable({
    enabled: isOpen,
    directions: ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'],
    initialSize,
    minWidth: 280,
    minHeight: 300,
    maxWidth: typeof window !== 'undefined' ? window.innerWidth - 32 : 1000,
    maxHeight: typeof window !== 'undefined' ? window.innerHeight - 80 : 1000,
    onResizeStart: () => onInteractionStateChange?.(true),
    onResizeEnd: handleResizeEnd,
  });

  const panelTransformOrigin = useMemo(() => {
    if (!toggleButtonRect) {
      return { x: '100%', y: '0%' };
    }

    const buttonCenterX = toggleButtonRect.left + toggleButtonRect.width / 2;
    const buttonCenterY = toggleButtonRect.top + toggleButtonRect.height / 2;
    const originX = clamp(((buttonCenterX - position.x) / size.width) * 100, 0, 100);
    const originY = clamp(((buttonCenterY - position.y) / size.height) * 100, 0, 100);

    return {
      x: `${originX.toFixed(2)}%`,
      y: `${originY.toFixed(2)}%`,
    };
  }, [position, size, toggleButtonRect]);

  const panelStyle = useMemo(
    () => ({
      position: 'fixed' as const,
      left: position.x,
      top: position.y,
      width: size.width,
      height: size.height,
      right: 'auto' as const,
      bottom: 'auto' as const,
      touchAction: 'none' as const,
      transformOrigin: `${panelTransformOrigin.x} ${panelTransformOrigin.y}`,
      '--bili-agent-panel-origin-x': panelTransformOrigin.x,
      '--bili-agent-panel-origin-y': panelTransformOrigin.y,
    }),
    [panelTransformOrigin, position, size],
  );

  // P3: history UI reserved only; HistoryDropdown arrives in P4
  void historyCallbacks;
  void isHistoryOpen;
  void setIsHistoryOpen;

  const handleNewChat = useCallback(() => {
    window.dispatchEvent(new CustomEvent('bili-agent-new-chat'))
    onNewChat?.()
  }, [onNewChat]);

  const [settingsSnapshot, setSettingsSnapshot] = useState<BiliAgentSettings | null>(null);

  useEffect(() => {
    if (!isSettingsOpen) return;
    let cancelled = false;
    readBiliAgentSettings()
      .then((s) => {
        if (!cancelled) setSettingsSnapshot(s);
      })
      .catch(() => {
        if (!cancelled) setSettingsSnapshot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isSettingsOpen]);

  return (
    <aside
      ref={dragRef as React.Ref<HTMLElement>}
      data-bili-agent-panel
      className={className}
      aria-hidden={!isOpen}
      role="dialog"
      aria-modal="false"
      style={panelStyle}
    >
      <div
        ref={dragHandleRef}
        className="bili-agent-panel__header"
        data-bili-agent-panel-drag-handle
        onPointerDown={handleHeaderPointerDown}
        style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      >
        <div className="bili-agent-panel__heading" data-no-drag>
          <h2 className="bili-agent-panel__title">BiliAgent</h2>
          {isSettingsOpen && <span className="bili-agent-panel__badge">Settings</span>}
          {/* P4: HistoryDropdown entry reserved here */}
          {!isSettingsOpen && (
            <span
              className="bili-agent-panel__history-toggle"
              aria-hidden="true"
              title="历史（P4）"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          )}
        </div>
        <button
          className="bili-agent-panel__new-chat-button"
          type="button"
          aria-label="新建对话"
          title="新建对话"
          onClick={handleNewChat}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button
          className={`bili-agent-panel__settings-button${isSettingsOpen ? ' bili-agent-panel__settings-button--active' : ''}`}
          type="button"
          aria-label={isSettingsOpen ? 'Back to chat' : 'Open settings'}
          title={isSettingsOpen ? 'Back to chat' : 'Settings'}
          onClick={() => setActiveView((current) => (current === 'settings' ? 'chat' : 'settings'))}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <button
          className="bili-agent-panel__close-button"
          type="button"
          aria-label="关闭面板"
          title="关闭"
          onClick={onClose}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {isSettingsOpen ? (
        settingsSnapshot ? (
          <SettingsPanel
            settings={settingsSnapshot}
            onClose={() => setActiveView('chat')}
            onSaved={(s) => {
              setSettingsSnapshot(s)
              setActiveView('chat')
            }}
          />
        ) : (
          <div className="bili-agent-panel__chat" style={{ padding: 16, color: '#999', fontSize: 13 }}>
            加载设置中...
          </div>
        )
      ) : (
        <ChatProvider>
          <PanelChatBody onNewChatEvent={onNewChat} />
        </ChatProvider>
      )}

      {resizeHandles.map((handle) => {
        const isHorizontal = handle.direction.includes('e') || handle.direction.includes('w');
        const isVertical = handle.direction.includes('n') || handle.direction.includes('s');
        const currentValue = isHorizontal ? size.width : size.height;
        const minVal = isHorizontal ? minWidth : minHeight;
        const maxVal = isHorizontal ? maxWidth : maxHeight;
        
        const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
          const step = e.shiftKey ? 10 : 1;
          
          if (isHorizontal && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
            e.preventDefault();
            const delta = e.key === 'ArrowRight' ? step : -step;
            resizeByKeyboard(handle.direction, delta);
          } else if (isVertical && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            const delta = e.key === 'ArrowDown' ? step : -step;
            resizeByKeyboard(handle.direction, delta);
          }
        };
        
        return (
          <div
            key={handle.direction}
            data-bili-agent-panel-resize-handle
            role="separator"
            aria-label={`Resize ${handle.direction} handle`}
            aria-orientation={isHorizontal ? 'horizontal' : 'vertical'}
            aria-valuenow={currentValue}
            aria-valuemin={minVal}
            aria-valuemax={maxVal}
            tabIndex={0}
            style={handle.style}
            onPointerDown={handle.onPointerDown}
            onKeyDown={handleKeyDown}
          />
        );
      })}

      <div className={`bili-agent-panel__footer${isSettingsOpen ? ' bili-agent-panel__footer--visible' : ''}`}>
        BiliAgent v0.0.1
      </div>
    </aside>
  );
}

function PanelChatBody({ onNewChatEvent }: { onNewChatEvent?: () => void }): React.ReactElement {
  const { clearChat } = useChat()

  useEffect(() => {
    const onNew = () => {
      clearChat()
      onNewChatEvent?.()
    }
    window.addEventListener('bili-agent-new-chat', onNew)
    return () => window.removeEventListener('bili-agent-new-chat', onNew)
  }, [clearChat, onNewChatEvent])

  return (
    <>
      <div className="bili-agent-panel__chat">
        <MessageList />
      </div>
      <div className="bili-agent-panel__input">
        <ChatInput />
      </div>
    </>
  )
}
