import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResizable } from '../../src/hooks/useResizable.js'

describe('useResizable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.userSelect = '';
  });

  describe('initial state', () => {
    it('returns default initial size', () => {
      const { result } = renderHook(() => useResizable());

      expect(result.current.size).toEqual({ width: 380, height: 600 });
      expect(result.current.isResizing).toBe(false);
      expect(result.current.activeDirection).toBeNull();
    });

    it('returns custom initialSize', () => {
      const { result } = renderHook(() =>
        useResizable({ initialSize: { width: 500, height: 400 } }),
      );

      expect(result.current.size).toEqual({ width: 500, height: 400 });
    });

    it('returns resize handles for default direction (se)', () => {
      const { result } = renderHook(() => useResizable());

      expect(result.current.resizeHandles).toHaveLength(1);
      expect(result.current.resizeHandles[0].direction).toBe('se');
      expect(result.current.resizeHandles[0].onPointerDown).toBeInstanceOf(Function);
      expect(result.current.resizeHandles[0].style).toMatchObject({
        position: 'absolute',
        cursor: 'nwse-resize',
        touchAction: 'none',
      });
    });

    it('returns resize handles for custom directions', () => {
      const { result } = renderHook(() =>
        useResizable({ directions: ['n', 's', 'e', 'w'] }),
      );

      expect(result.current.resizeHandles).toHaveLength(4);
      expect(result.current.resizeHandles.map((h) => h.direction)).toEqual(['n', 's', 'e', 'w']);
    });

    it('returns correct style with size', () => {
      const { result } = renderHook(() =>
        useResizable({ initialSize: { width: 500, height: 400 } }),
      );

      expect(result.current.style).toMatchObject({
        width: 500,
        height: 400,
      });
    });
  });

  describe('pointer down behavior', () => {
    it('sets isResizing and activeDirection on pointerDown', () => {
      const onResizeStart = vi.fn();
      const { result } = renderHook(() => useResizable({ onResizeStart }));

      const handle = result.current.resizeHandles[0];

      const mockElement = document.createElement('div');
      const pointerEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      Object.defineProperty(pointerEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        handle.onPointerDown(pointerEvent);
      });

      expect(result.current.isResizing).toBe(true);
      expect(result.current.activeDirection).toBe('se');
      expect(document.body.style.userSelect).toBe('none');
      expect(onResizeStart).toHaveBeenCalledWith('se');
      expect(mockElement.setPointerCapture).toHaveBeenCalledWith(1);
    });

    it('does not start resize with non-primary button', () => {
      const { result } = renderHook(() => useResizable());

      const handle = result.current.resizeHandles[0];

      const pointerEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      act(() => {
        handle.onPointerDown(pointerEvent);
      });

      expect(result.current.isResizing).toBe(false);
      expect(document.body.style.userSelect).toBe('');
    });

    it('does not start resize when disabled', () => {
      const { result } = renderHook(() => useResizable({ enabled: false }));

      const handle = result.current.resizeHandles[0];

      const pointerEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      act(() => {
        handle.onPointerDown(pointerEvent);
      });

      expect(result.current.isResizing).toBe(false);
      expect(document.body.style.userSelect).toBe('');
    });
  });

  describe('resizing state', () => {
    it('updates size on pointermove for southeast handle', () => {
      const onResize = vi.fn();
      const { result } = renderHook(() =>
        useResizable({
          initialSize: { width: 400, height: 300 },
          onResize,
        }),
      );

      const handle = result.current.resizeHandles[0];

      const mockElement = document.createElement('div');
      const pointerDownEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        handle.onPointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 150,
          clientY: 130,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(result.current.size.width).toBe(450);
      expect(result.current.size.height).toBe(330);
      expect(onResize).toHaveBeenCalled();
      expect(onResize).toHaveBeenCalledWith({ width: 450, height: 330 });
    });

    it('sets isResizing to false on pointerUp', () => {
      const onResizeEnd = vi.fn();
      const { result } = renderHook(() =>
        useResizable({
          initialSize: { width: 400, height: 300 },
          onResizeEnd,
        }),
      );

      const handle = result.current.resizeHandles[0];

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'hasPointerCapture', {
        value: vi.fn(() => true),
      });
      const pointerDownEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        handle.onPointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 150,
          clientY: 130,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(result.current.isResizing).toBe(true);

      act(() => {
        const pointerUpEvent = new PointerEvent('pointerup', {
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerUpEvent);
      });

      expect(result.current.isResizing).toBe(false);
      expect(result.current.activeDirection).toBeNull();
      expect(mockElement.releasePointerCapture).toHaveBeenCalledWith(1);
      expect(onResizeEnd).toHaveBeenCalled();
      expect(onResizeEnd).toHaveBeenCalledWith({ width: 450, height: 330 });
    });

    it('restores userSelect on pointerUp', () => {
      document.body.style.userSelect = 'text';

      const { result } = renderHook(() =>
        useResizable({ initialSize: { width: 400, height: 300 } }),
      );

      const handle = result.current.resizeHandles[0];

      const mockElement = document.createElement('div');
      const pointerDownEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        handle.onPointerDown(pointerDownEvent);
      });

      expect(document.body.style.userSelect).toBe('none');

      act(() => {
        const pointerUpEvent = new PointerEvent('pointerup', {
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerUpEvent);
      });

      expect(document.body.style.userSelect).toBe('text');
    });
  });

  describe('size constraints', () => {
    it('enforces minWidth constraint', () => {
      const { result } = renderHook(() =>
        useResizable({
          initialSize: { width: 400, height: 300 },
          minWidth: 300,
        }),
      );

      const handle = result.current.resizeHandles[0];

      const mockElement = document.createElement('div');
      const pointerDownEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        handle.onPointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 0,
          clientY: 100,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(result.current.size.width).toBe(300);
    });

    it('enforces maxWidth constraint', () => {
      const { result } = renderHook(() =>
        useResizable({
          initialSize: { width: 400, height: 300 },
          maxWidth: 500,
        }),
      );

      const handle = result.current.resizeHandles[0];

      const mockElement = document.createElement('div');
      const pointerDownEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        handle.onPointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 300,
          clientY: 100,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(result.current.size.width).toBe(500);
    });

    it('enforces minHeight constraint', () => {
      const { result } = renderHook(() =>
        useResizable({
          initialSize: { width: 400, height: 300 },
          minHeight: 250,
        }),
      );

      const handle = result.current.resizeHandles[0];

      const mockElement = document.createElement('div');
      const pointerDownEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        handle.onPointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 100,
          clientY: 0,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(result.current.size.height).toBe(250);
    });

    it('enforces maxHeight constraint', () => {
      const { result } = renderHook(() =>
        useResizable({
          initialSize: { width: 400, height: 300 },
          maxHeight: 400,
        }),
      );

      const handle = result.current.resizeHandles[0];

      const mockElement = document.createElement('div');
      const pointerDownEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        handle.onPointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 100,
          clientY: 300,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(result.current.size.height).toBe(400);
    });
  });

  describe('callbacks', () => {
    it('fires onResizeStart when resize begins', () => {
      const onResizeStart = vi.fn();
      const { result } = renderHook(() => useResizable({ onResizeStart }));

      const handle = result.current.resizeHandles[0];

      const mockElement = document.createElement('div');
      const pointerDownEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        handle.onPointerDown(pointerDownEvent);
      });

      expect(onResizeStart).toHaveBeenCalledTimes(1);
      expect(onResizeStart).toHaveBeenCalledWith('se');
    });

    it('fires onResize during resize movement', () => {
      const onResize = vi.fn();
      const { result } = renderHook(() =>
        useResizable({
          initialSize: { width: 400, height: 300 },
          onResize,
        }),
      );

      const handle = result.current.resizeHandles[0];

      const mockElement = document.createElement('div');
      const pointerDownEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        handle.onPointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 150,
          clientY: 130,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(onResize).toHaveBeenCalled();
      expect(onResize).toHaveBeenCalledWith(
        expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
      );
    });

    it('fires onResizeEnd when resize completes', () => {
      const onResizeEnd = vi.fn();
      const { result } = renderHook(() =>
        useResizable({
          initialSize: { width: 400, height: 300 },
          onResizeEnd,
        }),
      );

      const handle = result.current.resizeHandles[0];

      const mockElement = document.createElement('div');
      const pointerDownEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        handle.onPointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 150,
          clientY: 130,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      act(() => {
        const pointerUpEvent = new PointerEvent('pointerup', {
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerUpEvent);
      });

      expect(onResizeEnd).toHaveBeenCalledTimes(1);
      expect(onResizeEnd).toHaveBeenCalledWith(
        expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
      );
    });
  });

  describe('disabled behavior', () => {
    it('does not respond to pointer events when disabled', () => {
      const onResizeStart = vi.fn();
      const { result } = renderHook(() => useResizable({ enabled: false, onResizeStart }));

      const handle = result.current.resizeHandles[0];

      const pointerEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      act(() => {
        handle.onPointerDown(pointerEvent);
      });

      expect(result.current.isResizing).toBe(false);
      expect(onResizeStart).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('restores userSelect on unmount', () => {
      document.body.style.userSelect = 'text';

      const { result, unmount } = renderHook(() =>
        useResizable({ initialSize: { width: 400, height: 300 } }),
      );

      const handle = result.current.resizeHandles[0];

      const mockElement = document.createElement('div');
      const pointerDownEvent = new PointerEvent('pointerdown', {
        clientX: 100,
        clientY: 100,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      Object.defineProperty(pointerDownEvent, 'currentTarget', {
        value: mockElement,
        writable: false,
      });

      act(() => {
        handle.onPointerDown(pointerDownEvent);
      });

      expect(document.body.style.userSelect).toBe('none');

      unmount();

      expect(document.body.style.userSelect).toBe('text');
    });
  });
});
