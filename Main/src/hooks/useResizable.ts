import { useRef, useState, useEffect, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent, CSSProperties } from 'react';

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface UseResizableOptions {
  enabled?: boolean;
  directions?: ResizeDirection[];
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  initialSize?: { width: number; height: number };
  onResizeStart?: (dir: ResizeDirection) => void;
  onResize?: (size: { width: number; height: number }) => void;
  onResizeEnd?: (size: { width: number; height: number }) => void;
}

export interface ResizeHandle {
  direction: ResizeDirection;
  onPointerDown: (e: ReactPointerEvent) => void;
  style: CSSProperties;
}

export interface UseResizableReturn {
  size: { width: number; height: number };
  isResizing: boolean;
  activeDirection: ResizeDirection | null;
  resizeHandles: ResizeHandle[];
  style: CSSProperties;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  resizeByKeyboard: (direction: ResizeDirection, delta: number) => void;
}

const DEFAULT_MIN_WIDTH = 200;
const DEFAULT_MIN_HEIGHT = 150;
const DEFAULT_MAX_WIDTH = window.innerWidth;
const DEFAULT_MAX_HEIGHT = window.innerHeight;

const HANDLE_SIZE = 12;
const HANDLE_OFFSET = -6;

const DIRECTION_CURSORS: Record<ResizeDirection, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  sw: 'nesw-resize',
};

const DIRECTION_STYLES: Record<ResizeDirection, CSSProperties> = {
  n: { top: HANDLE_OFFSET, left: '50%', transform: 'translateX(-50%)', width: '100%', height: HANDLE_SIZE },
  s: { bottom: HANDLE_OFFSET, left: '50%', transform: 'translateX(-50%)', width: '100%', height: HANDLE_SIZE },
  e: { right: HANDLE_OFFSET, top: '50%', transform: 'translateY(-50%)', width: HANDLE_SIZE, height: '100%' },
  w: { left: HANDLE_OFFSET, top: '50%', transform: 'translateY(-50%)', width: HANDLE_SIZE, height: '100%' },
  ne: { top: HANDLE_OFFSET, right: HANDLE_OFFSET, width: HANDLE_SIZE, height: HANDLE_SIZE },
  nw: { top: HANDLE_OFFSET, left: HANDLE_OFFSET, width: HANDLE_SIZE, height: HANDLE_SIZE },
  se: { bottom: HANDLE_OFFSET, right: HANDLE_OFFSET, width: HANDLE_SIZE, height: HANDLE_SIZE },
  sw: { bottom: HANDLE_OFFSET, left: HANDLE_OFFSET, width: HANDLE_SIZE, height: HANDLE_SIZE },
};

export function useResizable(options: UseResizableOptions = {}): UseResizableReturn {
  const {
    enabled = true,
    directions = ['se'],
    minWidth = DEFAULT_MIN_WIDTH,
    minHeight = DEFAULT_MIN_HEIGHT,
    maxWidth = DEFAULT_MAX_WIDTH,
    maxHeight = DEFAULT_MAX_HEIGHT,
    initialSize = { width: 380, height: 600 },
    onResizeStart,
    onResize,
    onResizeEnd,
  } = options;

  const [size, setSize] = useState(initialSize);
  const [isResizing, setIsResizing] = useState(false);
  const [activeDirection, setActiveDirection] = useState<ResizeDirection | null>(null);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const onResizeEndRef = useRef(onResizeEnd);
  onResizeEndRef.current = onResizeEnd;

  const prevInitialSize = useRef(initialSize);
  useEffect(() => {
    if (
      prevInitialSize.current.width !== initialSize.width ||
      prevInitialSize.current.height !== initialSize.height
    ) {
      prevInitialSize.current = initialSize;
      setSize(initialSize);
    }
  }, [initialSize]);

  const resizeStateRef = useRef<{
    direction: ResizeDirection;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    originalUserSelect: string;
    targetElement: HTMLElement;
    pointerId: number;
    moveHandler: (e: PointerEvent) => void;
    upHandler: (e: PointerEvent) => void;
  } | null>(null);

  const constrainSize = useCallback(
    (width: number, height: number) => {
      const constrainedWidth = Math.min(Math.max(minWidth, width), maxWidth);
      const constrainedHeight = Math.min(Math.max(minHeight, height), maxHeight);
      return { width: constrainedWidth, height: constrainedHeight };
    },
    [minWidth, minHeight, maxWidth, maxHeight],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!resizeStateRef.current || !enabledRef.current) return;

      const { direction, startX, startY, startWidth, startHeight } = resizeStateRef.current;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;

      if (direction.includes('e')) {
        newWidth = startWidth + dx;
      } else if (direction.includes('w')) {
        newWidth = startWidth - dx;
      }

      if (direction.includes('s')) {
        newHeight = startHeight + dy;
      } else if (direction.includes('n')) {
        newHeight = startHeight - dy;
      }

      const constrained = constrainSize(newWidth, newHeight);
      setSize(constrained);
      onResizeRef.current?.(constrained);
    },
    [constrainSize],
  );

  const handlePointerUp = useCallback((_e: PointerEvent) => {
    void _e;
    if (!resizeStateRef.current) return;

    const { targetElement, pointerId, moveHandler, upHandler } = resizeStateRef.current;
    if (targetElement && targetElement.hasPointerCapture(pointerId)) {
      targetElement.releasePointerCapture(pointerId);
    }

    if (resizeStateRef.current.originalUserSelect !== undefined) {
      document.body.style.userSelect = resizeStateRef.current.originalUserSelect;
    }

    document.removeEventListener('pointermove', moveHandler);
    document.removeEventListener('pointerup', upHandler);

    resizeStateRef.current = null;

    setIsResizing(false);
    setActiveDirection(null);

    setSize((currentSize) => {
      onResizeEndRef.current?.(currentSize);
      return currentSize;
    });
  }, []);

  const createHandlePointerDown = useCallback(
    (direction: ResizeDirection) => (e: ReactPointerEvent) => {
      if (!enabled || e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();

      const target = e.currentTarget as HTMLElement;

      resizeStateRef.current = {
        direction,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: size.width,
        startHeight: size.height,
        originalUserSelect: document.body.style.userSelect,
        targetElement: target,
        pointerId: e.pointerId,
        moveHandler: handlePointerMove,
        upHandler: handlePointerUp,
      };

      document.body.style.userSelect = 'none';

      if (target.setPointerCapture) {
        target.setPointerCapture(e.pointerId);
      }

      setIsResizing(true);
      setActiveDirection(direction);
      onResizeStart?.(direction);

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [enabled, size, onResizeStart, handlePointerMove, handlePointerUp],
  );

  useEffect(() => {
    return () => {
      if (resizeStateRef.current?.originalUserSelect !== undefined) {
        document.body.style.userSelect = resizeStateRef.current.originalUserSelect;
      }
      if (resizeStateRef.current) {
        const { moveHandler, upHandler } = resizeStateRef.current;
        document.removeEventListener('pointermove', moveHandler);
        document.removeEventListener('pointerup', upHandler);
      }
    };
  }, []);

  const resizeHandles: ResizeHandle[] = directions.map((direction) => ({
    direction,
    onPointerDown: createHandlePointerDown(direction),
    style: {
      position: 'absolute',
      background: 'transparent',
      cursor: DIRECTION_CURSORS[direction],
      zIndex: 1,
      touchAction: 'none',
      ...DIRECTION_STYLES[direction],
    },
  }));

  const style: CSSProperties = {
    width: size.width,
    height: size.height,
  };

  const resizeByKeyboard = useCallback(
    (direction: ResizeDirection, delta: number) => {
      let newWidth = size.width;
      let newHeight = size.height;

      if (direction.includes('e')) {
        newWidth += delta;
      } else if (direction.includes('w')) {
        newWidth -= delta;
      }

      if (direction.includes('s')) {
        newHeight += delta;
      } else if (direction.includes('n')) {
        newHeight -= delta;
      }

      const constrained = constrainSize(newWidth, newHeight);
      setSize(constrained);
      onResizeRef.current?.(constrained);
    },
    [size, constrainSize],
  );

  return {
    size,
    isResizing,
    activeDirection,
    resizeHandles,
    style,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    resizeByKeyboard,
  };
}
