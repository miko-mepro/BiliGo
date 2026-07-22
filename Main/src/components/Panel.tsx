import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ToggleButtonRect } from './ToggleButton.js'
import { useDraggable } from '../hooks/useDraggable.js'
import { useResizable } from '../hooks/useResizable.js'
import { ChatProvider, useChat } from '../content/chat-context.js'
import { ChatInput } from './ChatInput.js'
import { MessageList } from './MessageList.js'
import { SettingsPanel } from '../content/settings-panel.js'
import { HistoryDropdown } from './HistoryDropdown.js'
import type { ConversationRecord } from '../lib/shared-types/index.js'
import {
  getHistoryIndex,
  deleteConversation,
  updateTitle,
  clearAllHistory,
} from '../lib/history/store.js'
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

  // 修复 #8：持有最新的缩放位置偏移，供拖拽结束持久化时叠加（声明提前以供闭包引用）
  const positionOffsetRef = useRef({ x: 0, y: 0 });

  const handleDragEnd = useCallback(
    (pos: { x: number; y: number }) => {
      onInteractionStateChange?.(false);
      // 修复 #8：持久化视觉位置（拖拽坐标 + 缩放偏移），保证下次恢复不回跳
      chrome.storage.local.set({
        'bili-agent-panel-position': {
          x: pos.x + positionOffsetRef.current.x,
          y: pos.y + positionOffsetRef.current.y,
        },
      });

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
      // 修复 #8：n/w 方向缩放会移动面板左上角，结束时把实际位置一并持久化，
      // 避免下次恢复时面板回跳到缩放前的位置
      chrome.storage.local.set({
        'bili-agent-panel-position': effectivePositionRef.current,
      });
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

  const { size, positionOffset, resizeHandles, minWidth, minHeight, maxWidth, maxHeight, resizeByKeyboard } = useResizable({
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

  // 修复 #8：同步最新偏移到 ref，供 handleDragEnd 闭包读取
  positionOffsetRef.current = positionOffset;

  // 修复 #8：面板实际位置 = 拖拽位置 + n/w 方向缩放产生的偏移，
  // 这样拖动西/北手柄时被拖边缘跟随鼠标，另一侧保持固定
  const effectivePosition = useMemo(
    () => ({
      x: position.x + positionOffset.x,
      y: position.y + positionOffset.y,
    }),
    [position, positionOffset],
  );

  // 供 handleResizeEnd 持久化时读取最新实际位置（避免闭包过期）
  const effectivePositionRef = useRef(effectivePosition);
  effectivePositionRef.current = effectivePosition;

  const panelTransformOrigin = useMemo(() => {
    if (!toggleButtonRect) {
      return { x: '100%', y: '0%' };
    }

    const buttonCenterX = toggleButtonRect.left + toggleButtonRect.width / 2;
    const buttonCenterY = toggleButtonRect.top + toggleButtonRect.height / 2;
    const originX = clamp(((buttonCenterX - effectivePosition.x) / size.width) * 100, 0, 100);
    const originY = clamp(((buttonCenterY - effectivePosition.y) / size.height) * 100, 0, 100);

    return {
      x: `${originX.toFixed(2)}%`,
      y: `${originY.toFixed(2)}%`,
    };
  }, [effectivePosition, size, toggleButtonRect]);

  const panelStyle = useMemo(
    () => ({
      position: 'fixed' as const,
      left: effectivePosition.x,
      top: effectivePosition.y,
      width: size.width,
      height: size.height,
      right: 'auto' as const,
      bottom: 'auto' as const,
      touchAction: 'none' as const,
      transformOrigin: `${panelTransformOrigin.x} ${panelTransformOrigin.y}`,
      '--bili-agent-panel-origin-x': panelTransformOrigin.x,
      '--bili-agent-panel-origin-y': panelTransformOrigin.y,
    }),
    [panelTransformOrigin, effectivePosition, size],
  );

  // P4: HistoryDropdown 已落地，移除 P3 占位 void
  void historyCallbacks;

  // 历史下拉展开/收起（点击 ☰ 按钮切换；点击下拉外部关闭）
  const toggleHistory = useCallback(() => {
    setIsHistoryOpen((prev) => !prev);
  }, []);

  // 外部点击关闭历史下拉：监听 document pointerdown，若点击落在
  // heading / history-dropdown / data-no-drag 区域之外则收起下拉
  useEffect(() => {
    if (!isHistoryOpen || isSettingsOpen) return;

    const handleOutsideClick = (e: PointerEvent) => {
      const path = e.composedPath();
      const clickedInside = path.some((node) =>
        node instanceof HTMLElement &&
        (node.classList?.contains('bili-agent-panel__heading') ||
         node.classList?.contains('bili-agent-history-dropdown') ||
         node.hasAttribute('data-no-drag'))
      );
      if (!clickedInside) {
        setIsHistoryOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [isHistoryOpen, isSettingsOpen]);

  // 修复 #1：新建对话只保留一个事件源——按钮派发一次事件（供 PanelChatBody 清空会话），
  // 并直接调用 onNewChat 通知外部；监听器侧不再回调外部，避免"派发→监听→再派发"的同步无限递归
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
        <div 
          className="bili-agent-panel__heading" 
          data-no-drag
          role="button"
          tabIndex={0}
          aria-label={isSettingsOpen ? 'BiliGo' : (isHistoryOpen ? '收起历史记录' : '展开历史记录')}
          aria-expanded={!isSettingsOpen ? isHistoryOpen : undefined}
          onClick={!isSettingsOpen ? toggleHistory : undefined}
          onKeyDown={(e) => {
            if (!isSettingsOpen && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              toggleHistory();
            }
          }}
        >
          <h2 className="bili-agent-panel__title">
            {/* 白色 BiliGo SVG 文字标题，currentColor 继承文字色 */}
            <svg 
              width="80" 
              height="20" 
              viewBox="0 0 80 20" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              aria-label="BiliGo"
            >
              <text 
                x="0" 
                y="16" 
                fill="currentColor" 
                fontFamily="system-ui, -apple-system, sans-serif" 
                fontSize="18" 
                fontWeight="700" 
                fontStyle="italic"
              >
                BiliGo
              </text>
            </svg>
          </h2>
          {isSettingsOpen && <span className="bili-agent-panel__badge">Settings</span>}
          {/* P4: 历史下拉挂载点--点击 heading 切换展开；设置页隐藏 chevron */}
          {!isSettingsOpen && (
            <span
              className={`bili-agent-panel__history-toggle${isHistoryOpen ? ' bili-agent-panel__history-toggle--open' : ''}`}
              aria-hidden="true"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        {/* P4: HistoryDropdown 移到 header 末尾，与 heading 同级，避免内层包装层干扰布局 */}
        {!isSettingsOpen && (
          <HistoryDropdown
            isOpen={isHistoryOpen}
            getIndex={getHistoryIndex}
            onLoad={async (id) => {
              // 加载历史：派发 HISTORY_LOAD_EVENT 通知 ChatContext REHYDRATE，并收起下拉
              window.dispatchEvent(new CustomEvent('biliagent:history-load', { detail: { conversationId: id } }))
              setIsHistoryOpen(false)
            }}
            onDelete={async (id) => { await deleteConversation(id) }}
            onRename={async (id, newTitle) => { await updateTitle(id, newTitle) }}
            onClearAll={async () => { await clearAllHistory() }}
          />
        )}
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
          <PanelChatBody />
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
        BiliGo v0.0.1
      </div>
    </aside>
  );
}

function PanelChatBody(): React.ReactElement {
  const { clearChat } = useChat()

  // 修复 #1：监听器只负责清空会话，不再触发外部 onNewChat 回调，
  // 防止外部回调再次派发同名事件导致 Maximum call stack size exceeded
  useEffect(() => {
    const onNew = () => {
      clearChat()
    }
    window.addEventListener('bili-agent-new-chat', onNew)
    return () => window.removeEventListener('bili-agent-new-chat', onNew)
  }, [clearChat])

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
