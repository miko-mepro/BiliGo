import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDraggable } from '../hooks/useDraggable.js'

export interface ToggleButtonRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface ToggleButtonProps {
  onClick: (buttonRect: ToggleButtonRect | null) => void;
  isOpen: boolean;
}

const STORAGE_KEY = 'bili-agent-toggle-position';

/** Toggle 按钮的近似尺寸（px），用于离屏夹取计算 */
const BUTTON_SIZE = 36;

function getDefaultPosition(): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x: 0, y: 0 };
  }
  return {
    x: window.innerWidth - 36,
    y: window.innerHeight / 2,
  };
}

/**
 * 修复 #10：把坐标夹取到当前视口内。
 * 大窗口保存的位置在小窗口恢复时可能完全离屏，导致用户无法再打开面板，
 * 因此加载存储位置和窗口 resize 时都要重新夹取。
 */
function clampToViewport(pos: { x: number; y: number }): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return pos;
  }
  return {
    x: Math.min(Math.max(0, pos.x), Math.max(0, window.innerWidth - BUTTON_SIZE)),
    y: Math.min(Math.max(0, pos.y), Math.max(0, window.innerHeight - BUTTON_SIZE)),
  };
}

export function ToggleButton({ onClick, isOpen }: ToggleButtonProps): React.ReactElement {
  const [loadedPosition, setLoadedPosition] = useState<{ x: number; y: number } | null>(null);
  const [key, setKey] = useState(0);
  // 修复 #10：记录最近一次已知位置（加载值或拖拽落点），resize 时以此为基准重新夹取
  const lastKnownPositionRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY]).then((result) => {
      const saved = result[STORAGE_KEY] as { x: number; y: number } | undefined;
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        // 修复 #10：加载时按当前视口夹取，防止大窗口保存的位置在小窗口离屏
        const clamped = clampToViewport(saved);
        lastKnownPositionRef.current = clamped;
        setLoadedPosition(clamped);
        setKey((k) => k + 1);
      }
    });
  }, []);

  // 修复 #10：视口尺寸变化时重新夹取按钮位置，保证入口始终可见可点
  useEffect(() => {
    const handleResize = (): void => {
      const base = lastKnownPositionRef.current;
      if (!base) return;
      const clamped = clampToViewport(base);
      if (clamped.x !== base.x || clamped.y !== base.y) {
        lastKnownPositionRef.current = clamped;
        setLoadedPosition(clamped);
        setKey((k) => k + 1);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePositionChange = useCallback((pos: { x: number; y: number }) => {
    lastKnownPositionRef.current = pos;
  }, []);

  const initialPosition = loadedPosition ?? getDefaultPosition();

  return (
    <ToggleButtonCore
      key={key}
      onClick={onClick}
      isOpen={isOpen}
      initialPosition={initialPosition}
      onPositionChange={handlePositionChange}
    />
  );
}

interface ToggleButtonCoreProps {
  onClick: (buttonRect: ToggleButtonRect | null) => void;
  isOpen: boolean;
  initialPosition: { x: number; y: number };
  /** 修复 #10：拖拽落点上报给外层，作为 resize 重新夹取的基准 */
  onPositionChange?: (pos: { x: number; y: number }) => void;
}

function ToggleButtonCore({ onClick, isOpen, initialPosition, onPositionChange }: ToggleButtonCoreProps): React.ReactElement {
  const onDragEnd = useCallback((pos: { x: number; y: number }) => {
    chrome.storage.local.set({ [STORAGE_KEY]: pos });
    onPositionChange?.(pos);
  }, [onPositionChange]);

  const { hasDragged, dragRef, handlePointerDown, style } = useDraggable({
    initialPosition,
    onDragEnd,
    useTransformOnDrag: true,
    baseTransform: 'translateY(-50%) scale(0.7)',
  });

  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const setRefs = useCallback(
    (element: HTMLButtonElement | null) => {
      buttonRef.current = element;
      (dragRef as React.MutableRefObject<HTMLElement | null>).current = element;
    },
    [dragRef],
  );

  const handleClick = () => {
    if (hasDragged) {
      return;
    }

    const rect = buttonRef.current?.getBoundingClientRect();
    onClick(
      rect
        ? {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          }
        : null,
    );
  };

  const className = `bili-agent-toggle${isOpen ? ' bili-agent-toggle--open' : ''}`;

  return (
    <button
      ref={setRefs}
      type="button"
      data-bili-agent-toggle
      data-draggable="toggle-button"
      className={className}
      style={style}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      aria-label={isOpen ? '关闭BiliAgent面板' : '打开BiliAgent面板'}
      aria-expanded={isOpen}
    >
      AI
    </button>
  );
}
