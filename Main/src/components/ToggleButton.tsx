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

function getDefaultPosition(): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x: 0, y: 0 };
  }
  return {
    x: window.innerWidth - 36,
    y: window.innerHeight / 2,
  };
}

export function ToggleButton({ onClick, isOpen }: ToggleButtonProps): React.ReactElement {
  const [loadedPosition, setLoadedPosition] = useState<{ x: number; y: number } | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY]).then((result) => {
      const saved = result[STORAGE_KEY] as { x: number; y: number } | undefined;
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        setLoadedPosition(saved);
        setKey((k) => k + 1);
      }
    });
  }, []);

  const initialPosition = loadedPosition ?? getDefaultPosition();

  return (
    <ToggleButtonCore
      key={key}
      onClick={onClick}
      isOpen={isOpen}
      initialPosition={initialPosition}
    />
  );
}

interface ToggleButtonCoreProps {
  onClick: (buttonRect: ToggleButtonRect | null) => void;
  isOpen: boolean;
  initialPosition: { x: number; y: number };
}

function ToggleButtonCore({ onClick, isOpen, initialPosition }: ToggleButtonCoreProps): React.ReactElement {
  const onDragEnd = useCallback((pos: { x: number; y: number }) => {
    chrome.storage.local.set({ [STORAGE_KEY]: pos });
  }, []);

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
