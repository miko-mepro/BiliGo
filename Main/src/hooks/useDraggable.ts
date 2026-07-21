import { useRef, useState, useEffect, useCallback } from 'react';
import type { RefObject, PointerEvent as ReactPointerEvent, CSSProperties } from 'react';

export interface UseDraggableOptions {
  enabled?: boolean;
  axis?: 'x' | 'y' | 'both';
  bounds?: { minX?: number; minY?: number; maxX?: number; maxY?: number };
  handleRef?: RefObject<HTMLElement | null>;
  initialPosition?: { x: number; y: number };
  onDragStart?: () => void;
  onDrag?: (pos: { x: number; y: number }) => void;
  onDragEnd?: (pos: { x: number; y: number }) => void;
  useTransformOnDrag?: boolean;
  baseTransform?: string;
}

export interface UseDraggableReturn {
  position: { x: number; y: number };
  isDragging: boolean;
  hasDragged: boolean;
  dragRef: RefObject<HTMLElement | null>;
  handlePointerDown: (e: ReactPointerEvent) => void;
  style: CSSProperties;
}

const DRAG_THRESHOLD = 5;

export function useDraggable(options: UseDraggableOptions = {}): UseDraggableReturn {
  const {
    enabled = true,
    axis = 'both',
    bounds,
    handleRef,
    initialPosition = { x: 0, y: 0 },
    onDragStart,
    onDrag,
    onDragEnd,
    useTransformOnDrag = false,
    baseTransform = '',
  } = options;

  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const dragRef = useRef<HTMLElement>(null);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const axisRef = useRef(axis);
  axisRef.current = axis;
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;
  const useTransformOnDragRef = useRef(useTransformOnDrag);
  useTransformOnDragRef.current = useTransformOnDrag;
  const baseTransformRef = useRef(baseTransform);
  baseTransformRef.current = baseTransform;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;

  const prevInitialPosition = useRef(initialPosition);
  useEffect(() => {
    if (
      prevInitialPosition.current.x !== initialPosition.x ||
      prevInitialPosition.current.y !== initialPosition.y
    ) {
      prevInitialPosition.current = initialPosition;
      setPosition(initialPosition);
    }
  }, [initialPosition]);

  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
    totalMovement: number;
    hasStarted: boolean;
    originalUserSelect: string;
    moveHandler: (e: PointerEvent) => void;
    upHandler: (e: PointerEvent) => void;
    cachedRect: { width: number; height: number };
    cachedViewport: { width: number; height: number };
    rafId: number | null;
    pendingPos: { x: number; y: number } | null;
  } | null>(null);

  const clampPosition = useCallback(
    (x: number, y: number, elementWidth: number, elementHeight: number) => {
      const minX = bounds?.minX ?? 0;
      const minY = bounds?.minY ?? 0;
      const maxX = bounds?.maxX ?? window.innerWidth;
      const maxY = bounds?.maxY ?? window.innerHeight;

      const clampedX = Math.min(Math.max(minX, x), maxX - elementWidth);
      const clampedY = Math.min(Math.max(minY, y), maxY - elementHeight);

      return { x: clampedX, y: clampedY };
    },
    [bounds],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragStateRef.current || !enabledRef.current) return;

      const state = dragStateRef.current;
      const { startX, startY, startPosX, startPosY } = state;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      state.totalMovement = Math.abs(dx) + Math.abs(dy);

      if (state.totalMovement >= DRAG_THRESHOLD) {
        if (!state.hasStarted) {
          state.hasStarted = true;
          setIsDragging(true);
          setHasDragged(true);
          onDragStartRef.current?.();
        }

        let newX = startPosX;
        let newY = startPosY;

        if (axisRef.current === 'x' || axisRef.current === 'both') {
          newX = startPosX + dx;
        }
        if (axisRef.current === 'y' || axisRef.current === 'both') {
          newY = startPosY + dy;
        }

        if (useTransformOnDragRef.current) {
          const currentBounds = boundsRef.current;
          const minX = currentBounds?.minX ?? 0;
          const minY = currentBounds?.minY ?? 0;
          const maxX = currentBounds?.maxX ?? state.cachedViewport.width;
          const maxY = currentBounds?.maxY ?? state.cachedViewport.height;
          const clamped = {
            x: Math.min(Math.max(minX, newX), maxX - state.cachedRect.width),
            y: Math.min(Math.max(minY, newY), maxY - state.cachedRect.height),
          };

          state.pendingPos = clamped;
          if (state.rafId === null) {
            state.rafId = window.requestAnimationFrame(() => {
              state.rafId = null;
              if (!state.pendingPos || !dragRef.current) return;

              const pos = state.pendingPos;
              const offsetX = pos.x - state.startPosX;
              const offsetY = pos.y - state.startPosY;
              const dragTransform = `translate3d(${offsetX}px, ${offsetY}px, 0)`;
              dragRef.current.style.transform = `${dragTransform} ${baseTransformRef.current}`.trim();
              onDragRef.current?.(pos);
            });
          }
          return;
        }

        const element = dragRef.current;
        if (element) {
          const rect = element.getBoundingClientRect();
          const clamped = clampPosition(newX, newY, rect.width, rect.height);
          setPosition(clamped);
          onDragRef.current?.(clamped);
        }
      }
    },
    [clampPosition],
  );

  const clickSuppressorRef = useRef<((e: MouseEvent) => void) | null>(null);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    if (!dragStateRef.current) return;

    const state = dragStateRef.current;
    const { moveHandler, upHandler } = state;

    const element = dragRef.current;
    if (element && element.hasPointerCapture(e.pointerId)) {
      element.releasePointerCapture(e.pointerId);
    }

    if (state.originalUserSelect !== undefined) {
      document.body.style.userSelect = state.originalUserSelect;
    }

    const wasDragging = state.hasStarted;
    let finalPosition = state.pendingPos;

    if (useTransformOnDragRef.current && state.rafId !== null) {
      window.cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }

    if (useTransformOnDragRef.current && wasDragging && !finalPosition) {
      const dx = e.clientX - state.startX;
      const dy = e.clientY - state.startY;
      let newX = state.startPosX;
      let newY = state.startPosY;

      if (axisRef.current === 'x' || axisRef.current === 'both') {
        newX = state.startPosX + dx;
      }
      if (axisRef.current === 'y' || axisRef.current === 'both') {
        newY = state.startPosY + dy;
      }

      const currentBounds = boundsRef.current;
      const minX = currentBounds?.minX ?? 0;
      const minY = currentBounds?.minY ?? 0;
      const maxX = currentBounds?.maxX ?? state.cachedViewport.width;
      const maxY = currentBounds?.maxY ?? state.cachedViewport.height;
      finalPosition = {
        x: Math.min(Math.max(minX, newX), maxX - state.cachedRect.width),
        y: Math.min(Math.max(minY, newY), maxY - state.cachedRect.height),
      };
    }

    document.removeEventListener('pointermove', moveHandler);
    document.removeEventListener('pointerup', upHandler);

    dragStateRef.current = null;

    if (wasDragging) {
      setIsDragging(false);

      if (useTransformOnDragRef.current && finalPosition) {
        if (element) {
          element.style.transform = '';
        }
        setPosition(finalPosition);
        onDragEndRef.current?.(finalPosition);
      } else {
        setPosition((currentPos) => {
          onDragEndRef.current?.(currentPos);
          return currentPos;
        });
      }

      // Suppress the click event that follows the drag to prevent accidental outside-click close
      const clickSuppressor = (clickEvent: MouseEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        document.removeEventListener('click', clickSuppressor, true);
        clickSuppressorRef.current = null;
      };
      clickSuppressorRef.current = clickSuppressor;
      document.addEventListener('click', clickSuppressor, true);
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled || e.button !== 0) return;

      const targetElement = handleRef?.current ?? dragRef.current;
      if (!targetElement) return;

      if (handleRef && !handleRef.current?.contains(e.target as Node)) {
        return;
      }

      e.preventDefault();

      const element = dragRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();

      dragStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: position.x,
        startPosY: position.y,
        totalMovement: 0,
        hasStarted: false,
        originalUserSelect: document.body.style.userSelect,
        moveHandler: handlePointerMove,
        upHandler: handlePointerUp,
        cachedRect: { width: rect.width, height: rect.height },
        cachedViewport: { width: window.innerWidth, height: window.innerHeight },
        rafId: null,
        pendingPos: null,
      };

      document.body.style.userSelect = 'none';

      if (element.setPointerCapture) {
        element.setPointerCapture(e.pointerId);
      }

      setHasDragged(false);

      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [enabled, handleRef, handlePointerMove, handlePointerUp, position],
  );

  useEffect(() => {
    return () => {
      if (dragStateRef.current?.originalUserSelect !== undefined) {
        document.body.style.userSelect = dragStateRef.current.originalUserSelect;
      }
      if (dragStateRef.current) {
        const { moveHandler, upHandler, rafId } = dragStateRef.current;
        document.removeEventListener('pointermove', moveHandler);
        document.removeEventListener('pointerup', upHandler);
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
        }
      }
      if (clickSuppressorRef.current) {
        document.removeEventListener('click', clickSuppressorRef.current, true);
      }
    };
  }, []);

  const style: CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    touchAction: 'none',
    cursor: isDragging ? 'grabbing' : enabled ? 'grab' : undefined,
  };

  return {
    position,
    isDragging,
    hasDragged,
    dragRef,
    handlePointerDown,
    style,
  };
}
