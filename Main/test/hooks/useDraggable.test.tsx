import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDraggable } from '../../src/hooks/useDraggable.js'

describe('useDraggable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.userSelect = '';
  });

  describe('initial state', () => {
    it('returns default initial position {x:0, y:0}', () => {
      const { result } = renderHook(() => useDraggable());

      expect(result.current.position).toEqual({ x: 0, y: 0 });
      expect(result.current.isDragging).toBe(false);
      expect(result.current.hasDragged).toBe(false);
    });

    it('returns custom initialPosition', () => {
      const { result } = renderHook(() =>
        useDraggable({ initialPosition: { x: 100, y: 50 } }),
      );

      expect(result.current.position).toEqual({ x: 100, y: 50 });
    });

    it('returns a stable dragRef', () => {
      const { result, rerender } = renderHook(() => useDraggable());

      const firstRef = result.current.dragRef;
      rerender();
      const secondRef = result.current.dragRef;

      expect(firstRef).toBe(secondRef);
    });

    it('returns correct style with position fixed and initial position', () => {
      const { result } = renderHook(() =>
        useDraggable({ initialPosition: { x: 100, y: 50 } }),
      );

      expect(result.current.style).toMatchObject({
        position: 'fixed',
        left: 100,
        top: 50,
        touchAction: 'none',
        cursor: 'grab',
      });
    });
  });

  describe('pointer down behavior', () => {
    it('sets up drag state on pointerDown with primary button', () => {
      const { result } = renderHook(() => useDraggable());

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'getBoundingClientRect', {
        value: vi.fn(() => ({ left: 10, top: 20, width: 100, height: 50 })),
      });
      result.current.dragRef.current = mockElement;

      const pointerEvent = new PointerEvent('pointerdown', {
        clientX: 50,
        clientY: 60,
        button: 0,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      act(() => {
        result.current.handlePointerDown(pointerEvent);
      });

      expect(document.body.style.userSelect).toBe('none');
      expect(mockElement.setPointerCapture).toHaveBeenCalledWith(pointerEvent.pointerId);
    });

    it('does not set up drag state with non-primary button', () => {
      const { result } = renderHook(() => useDraggable());

      const mockElement = document.createElement('div');
      result.current.dragRef.current = mockElement;

      const pointerEvent = new PointerEvent('pointerdown', {
        clientX: 50,
        clientY: 60,
        button: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      act(() => {
        result.current.handlePointerDown(pointerEvent);
      });

      expect(document.body.style.userSelect).toBe('');
    });

    it('does not start drag when disabled', () => {
      const { result } = renderHook(() => useDraggable({ enabled: false }));

      const mockElement = document.createElement('div');
      result.current.dragRef.current = mockElement;

      const pointerEvent = new PointerEvent('pointerdown', {
        clientX: 50,
        clientY: 60,
        button: 0,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      act(() => {
        result.current.handlePointerDown(pointerEvent);
      });

      expect(document.body.style.userSelect).toBe('');
    });
  });

  describe('dragging state', () => {
    it('sets isDragging to true after threshold movement', () => {
      const { result } = renderHook(() => useDraggable());

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'getBoundingClientRect', {
        value: vi.fn(() => ({ left: 10, top: 20, width: 100, height: 50 })),
      });
      result.current.dragRef.current = mockElement;

      const pointerDownEvent = new PointerEvent('pointerdown', {
        clientX: 50,
        clientY: 60,
        button: 0,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }) as unknown as React.PointerEvent;

      act(() => {
        result.current.handlePointerDown(pointerDownEvent);
      });

      expect(result.current.isDragging).toBe(false);

      const pointerMoveEvent = new PointerEvent('pointermove', {
        clientX: 60,
        clientY: 70,
        pointerId: 1,
        bubbles: true,
      });

      act(() => {
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(result.current.isDragging).toBe(true);
      expect(result.current.hasDragged).toBe(true);
    });

    it('updates position on pointermove when dragging', () => {
      const onDrag = vi.fn();
      const { result } = renderHook(() => useDraggable({ onDrag }));

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'getBoundingClientRect', {
        value: vi.fn(() => ({ left: 10, top: 20, width: 100, height: 50 })),
      });
      result.current.dragRef.current = mockElement;

      act(() => {
        const pointerDownEvent = new PointerEvent('pointerdown', {
          clientX: 50,
          clientY: 60,
          button: 0,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        }) as unknown as React.PointerEvent;
        result.current.handlePointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 80,
          clientY: 90,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(result.current.position.x).toBeGreaterThan(0);
      expect(result.current.position.y).toBeGreaterThan(0);
      expect(onDrag).toHaveBeenCalled();
    });

    it('applies drag translation before base transform so scale does not shrink movement', () => {
      const requestAnimationFrameSpy = vi
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          callback(0);
          return 1;
        });

      try {
        const { result } = renderHook(() =>
          useDraggable({
            initialPosition: { x: 100, y: 150 },
            useTransformOnDrag: true,
            baseTransform: 'translateY(-50%) scale(0.7)',
          }),
        );

        const mockElement = document.createElement('div');
        Object.defineProperty(mockElement, 'getBoundingClientRect', {
          value: vi.fn(() => ({ left: 100, top: 150, width: 52, height: 52 })),
        });
        result.current.dragRef.current = mockElement;

        act(() => {
          const pointerDownEvent = new PointerEvent('pointerdown', {
            clientX: 100,
            clientY: 150,
            button: 0,
            pointerId: 1,
            bubbles: true,
            cancelable: true,
          }) as unknown as React.PointerEvent;
          result.current.handlePointerDown(pointerDownEvent);
        });

        act(() => {
          const pointerMoveEvent = new PointerEvent('pointermove', {
            clientX: 130,
            clientY: 190,
            pointerId: 1,
            bubbles: true,
          });
          document.dispatchEvent(pointerMoveEvent);
        });

        expect(mockElement.style.transform).toBe(
          'translate3d(30px, 40px, 0) translateY(-50%) scale(0.7)',
        );
      } finally {
        requestAnimationFrameSpy.mockRestore();
      }
    });

    it('sets isDragging to false on pointerUp', () => {
      const onDragEnd = vi.fn();
      const { result } = renderHook(() => useDraggable({ onDragEnd }));

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'getBoundingClientRect', {
        value: vi.fn(() => ({ left: 10, top: 20, width: 100, height: 50 })),
      });
      Object.defineProperty(mockElement, 'hasPointerCapture', {
        value: vi.fn(() => true),
      });
      result.current.dragRef.current = mockElement;

      act(() => {
        const pointerDownEvent = new PointerEvent('pointerdown', {
          clientX: 50,
          clientY: 60,
          button: 0,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        }) as unknown as React.PointerEvent;
        result.current.handlePointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 80,
          clientY: 90,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(result.current.isDragging).toBe(true);

      act(() => {
        const pointerUpEvent = new PointerEvent('pointerup', {
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerUpEvent);
      });

      expect(result.current.isDragging).toBe(false);
      expect(mockElement.releasePointerCapture).toHaveBeenCalledWith(1);
      expect(onDragEnd).toHaveBeenCalled();
    });

    it('restores userSelect on pointerUp', () => {
      const { result } = renderHook(() => useDraggable());

      document.body.style.userSelect = 'text';

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'getBoundingClientRect', {
        value: vi.fn(() => ({ left: 10, top: 20, width: 100, height: 50 })),
      });
      result.current.dragRef.current = mockElement;

      act(() => {
        const pointerDownEvent = new PointerEvent('pointerdown', {
          clientX: 50,
          clientY: 60,
          button: 0,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        }) as unknown as React.PointerEvent;
        result.current.handlePointerDown(pointerDownEvent);
      });

      expect(document.body.style.userSelect).toBe('none');

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 80,
          clientY: 90,
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

      expect(document.body.style.userSelect).toBe('text');
    });
  });

  describe('axis constraint', () => {
    it('constrains movement to x-axis only when axis is x', () => {
      const { result } = renderHook(() => useDraggable({ axis: 'x' }));

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'getBoundingClientRect', {
        value: vi.fn(() => ({ left: 10, top: 20, width: 100, height: 50 })),
      });
      result.current.dragRef.current = mockElement;

      act(() => {
        const pointerDownEvent = new PointerEvent('pointerdown', {
          clientX: 50,
          clientY: 60,
          button: 0,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        }) as unknown as React.PointerEvent;
        result.current.handlePointerDown(pointerDownEvent);
      });

      const initialY = result.current.position.y;

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 80,
          clientY: 90,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(result.current.position.x).toBeGreaterThan(10);
      expect(result.current.position.y).toBe(initialY);
    });

    it('constrains movement to y-axis only when axis is y', () => {
      const { result } = renderHook(() => useDraggable({ axis: 'y' }));

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'getBoundingClientRect', {
        value: vi.fn(() => ({ left: 10, top: 20, width: 100, height: 50 })),
      });
      result.current.dragRef.current = mockElement;

      act(() => {
        const pointerDownEvent = new PointerEvent('pointerdown', {
          clientX: 50,
          clientY: 60,
          button: 0,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        }) as unknown as React.PointerEvent;
        result.current.handlePointerDown(pointerDownEvent);
      });

      const initialX = result.current.position.x;

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 80,
          clientY: 90,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(result.current.position.x).toBe(initialX);
      expect(result.current.position.y).toBeGreaterThan(20);
    });
  });

  describe('callbacks', () => {
    it('fires onDragStart when drag threshold is exceeded', () => {
      const onDragStart = vi.fn();
      const { result } = renderHook(() => useDraggable({ onDragStart }));

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'getBoundingClientRect', {
        value: vi.fn(() => ({ left: 10, top: 20, width: 100, height: 50 })),
      });
      result.current.dragRef.current = mockElement;

      act(() => {
        const pointerDownEvent = new PointerEvent('pointerdown', {
          clientX: 50,
          clientY: 60,
          button: 0,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        }) as unknown as React.PointerEvent;
        result.current.handlePointerDown(pointerDownEvent);
      });

      expect(onDragStart).not.toHaveBeenCalled();

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 60,
          clientY: 70,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(onDragStart).toHaveBeenCalledTimes(1);
    });

    it('fires onDrag during drag movement', () => {
      const onDrag = vi.fn();
      const { result } = renderHook(() => useDraggable({ onDrag }));

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'getBoundingClientRect', {
        value: vi.fn(() => ({ left: 10, top: 20, width: 100, height: 50 })),
      });
      result.current.dragRef.current = mockElement;

      act(() => {
        const pointerDownEvent = new PointerEvent('pointerdown', {
          clientX: 50,
          clientY: 60,
          button: 0,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        }) as unknown as React.PointerEvent;
        result.current.handlePointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 80,
          clientY: 90,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(onDrag).toHaveBeenCalled();
      expect(onDrag).toHaveBeenCalledWith(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    });

    it('fires onDragEnd when drag completes', () => {
      const onDragEnd = vi.fn();
      const { result } = renderHook(() => useDraggable({ onDragEnd }));

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'getBoundingClientRect', {
        value: vi.fn(() => ({ left: 10, top: 20, width: 100, height: 50 })),
      });
      result.current.dragRef.current = mockElement;

      act(() => {
        const pointerDownEvent = new PointerEvent('pointerdown', {
          clientX: 50,
          clientY: 60,
          button: 0,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        }) as unknown as React.PointerEvent;
        result.current.handlePointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 80,
          clientY: 90,
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

      expect(onDragEnd).toHaveBeenCalledTimes(1);
      expect(onDragEnd).toHaveBeenCalledWith(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
    });
  });

  describe('threshold behavior', () => {
    it('does not set hasDragged when movement is below threshold', () => {
      const { result } = renderHook(() => useDraggable());

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'getBoundingClientRect', {
        value: vi.fn(() => ({ left: 10, top: 20, width: 100, height: 50 })),
      });
      result.current.dragRef.current = mockElement;

      act(() => {
        const pointerDownEvent = new PointerEvent('pointerdown', {
          clientX: 50,
          clientY: 60,
          button: 0,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        }) as unknown as React.PointerEvent;
        result.current.handlePointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 52,
          clientY: 61,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(result.current.isDragging).toBe(false);
      expect(result.current.hasDragged).toBe(false);
    });

    it('sets hasDragged when movement exceeds threshold', () => {
      const { result } = renderHook(() => useDraggable());

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'getBoundingClientRect', {
        value: vi.fn(() => ({ left: 10, top: 20, width: 100, height: 50 })),
      });
      result.current.dragRef.current = mockElement;

      act(() => {
        const pointerDownEvent = new PointerEvent('pointerdown', {
          clientX: 50,
          clientY: 60,
          button: 0,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        }) as unknown as React.PointerEvent;
        result.current.handlePointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 58,
          clientY: 68,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(result.current.hasDragged).toBe(true);
    });
  });

  describe('disabled behavior', () => {
    it('does not respond to pointer events when disabled', () => {
      const onDragStart = vi.fn();
      const { result } = renderHook(() => useDraggable({ enabled: false, onDragStart }));

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'getBoundingClientRect', {
        value: vi.fn(() => ({ left: 10, top: 20, width: 100, height: 50 })),
      });
      result.current.dragRef.current = mockElement;

      act(() => {
        const pointerDownEvent = new PointerEvent('pointerdown', {
          clientX: 50,
          clientY: 60,
          button: 0,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        }) as unknown as React.PointerEvent;
        result.current.handlePointerDown(pointerDownEvent);
      });

      act(() => {
        const pointerMoveEvent = new PointerEvent('pointermove', {
          clientX: 80,
          clientY: 90,
          pointerId: 1,
          bubbles: true,
        });
        document.dispatchEvent(pointerMoveEvent);
      });

      expect(result.current.isDragging).toBe(false);
      expect(onDragStart).not.toHaveBeenCalled();
    });

    it('returns undefined cursor when disabled', () => {
      const { result } = renderHook(() => useDraggable({ enabled: false }));

      expect(result.current.style.cursor).toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('restores userSelect on unmount', () => {
      document.body.style.userSelect = 'text';

      const { result, unmount } = renderHook(() => useDraggable());

      const mockElement = document.createElement('div');
      Object.defineProperty(mockElement, 'getBoundingClientRect', {
        value: vi.fn(() => ({ left: 10, top: 20, width: 100, height: 50 })),
      });
      result.current.dragRef.current = mockElement;

      act(() => {
        const pointerDownEvent = new PointerEvent('pointerdown', {
          clientX: 50,
          clientY: 60,
          button: 0,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        }) as unknown as React.PointerEvent;
        result.current.handlePointerDown(pointerDownEvent);
      });

      expect(document.body.style.userSelect).toBe('none');

      unmount();

      expect(document.body.style.userSelect).toBe('text');
    });
  });
});
