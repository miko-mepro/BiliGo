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
  /**
   * 修复 #8：n/w 方向缩放产生的位置偏移量（相对初始位置的累计值）。
   * 拖动西/北侧手柄时宽高变化的同时元素左上角必须同步移动，
   * 否则被拖边缘不动、另一侧移动，手柄脱离鼠标。
   * 使用方需将该偏移叠加到元素的 left/top 上。
   */
  positionOffset: { x: number; y: number };
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
  // 修复 #8：n/w 方向缩放时左/上边缘需要同步移动，此偏移量由使用方叠加到 left/top
  const [positionOffset, setPositionOffset] = useState({ x: 0, y: 0 });
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
    /** 修复 #8：记录缩放开始时的位置偏移，n/w 方向在此基础上累计 */
    startOffsetX: number;
    startOffsetY: number;
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
      // 修复 #13：只响应发起缩放的那个 pointer，忽略第二根手指的移动
      if (e.pointerId !== resizeStateRef.current.pointerId) return;

      const {
        direction, startX, startY, startWidth, startHeight,
        startOffsetX, startOffsetY,
      } = resizeStateRef.current;

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
      // 修复 #8：w/n 方向缩放时，左/上边缘随鼠标移动——位置偏移量 = 实际尺寸变化量
      // （用约束后的尺寸计算，保证尺寸被 min/max 夹取时边缘不会脱离）
      setPositionOffset({
        x: direction.includes('w')
          ? startOffsetX + (startWidth - constrained.width)
          : startOffsetX,
        y: direction.includes('n')
          ? startOffsetY + (startHeight - constrained.height)
          : startOffsetY,
      });
      setSize(constrained);
      onResizeRef.current?.(constrained);
    },
    [constrainSize],
  );

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!resizeStateRef.current) return;
    // 修复 #13：第二根手指抬起不应提前结束缩放
    if (e.pointerId !== resizeStateRef.current.pointerId) return;

    const { targetElement, pointerId, moveHandler, upHandler } = resizeStateRef.current;
    if (targetElement && targetElement.hasPointerCapture(pointerId)) {
      targetElement.releasePointerCapture(pointerId);
    }

    if (resizeStateRef.current.originalUserSelect !== undefined) {
      document.body.style.userSelect = resizeStateRef.current.originalUserSelect;
    }

    document.removeEventListener('pointermove', moveHandler);
    document.removeEventListener('pointerup', upHandler);
    // 修复 #12：pointercancel 与 pointerup 共用清理函数，此处一并移除
    document.removeEventListener('pointercancel', upHandler);

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
      // 修复 #13：已有缩放进行中时忽略第二根手指的按下
      if (resizeStateRef.current !== null) return;

      e.preventDefault();
      e.stopPropagation();

      const target = e.currentTarget as HTMLElement;

      resizeStateRef.current = {
        direction,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: size.width,
        startHeight: size.height,
        startOffsetX: positionOffset.x,
        startOffsetY: positionOffset.y,
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
      // 修复 #12：系统手势等取消 pointer 时也要走清理逻辑，否则 userSelect:none 等状态泄漏
      document.addEventListener('pointercancel', handlePointerUp);
    },
    [enabled, size, positionOffset, onResizeStart, handlePointerMove, handlePointerUp],
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
        // 修复 #12：卸载时同步移除 pointercancel 监听
        document.removeEventListener('pointercancel', upHandler);
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
      // 修复 #8：键盘缩放同样在 w/n 方向同步位置偏移，保持左/上边缘跟随
      setPositionOffset((prev) => ({
        x: direction.includes('w') ? prev.x + (size.width - constrained.width) : prev.x,
        y: direction.includes('n') ? prev.y + (size.height - constrained.height) : prev.y,
      }));
      setSize(constrained);
      onResizeRef.current?.(constrained);
    },
    [size, constrainSize],
  );

  return {
    size,
    positionOffset,
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
