import { vi, expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)

// Chrome API mocks for vitest
globalThis.chrome = {
  runtime: {
    sendMessage: vi.fn(),
    connect: vi.fn((info) => ({
      name: info?.name || '',
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
      postMessage: vi.fn(),
      disconnect: vi.fn(),
    })),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    onConnect: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  storage: {
    local: {
      get: vi.fn((keys) => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => Promise.resolve()),
    },
    session: {
      get: vi.fn((keys) => Promise.resolve({})),
      set: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => Promise.resolve()),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  cookies: {
    get: vi.fn(() => Promise.resolve(null)),
    getAll: vi.fn(() => Promise.resolve([])),
  },
  tabs: {
    create: vi.fn(() => Promise.resolve({ id: 1 })),
    query: vi.fn(() => Promise.resolve([])),
  },
} as any

// Pointer Events API polyfills for jsdom
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = vi.fn()
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = vi.fn()
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn(() => false)
}

// jsdom may lack PointerEvent constructor
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    width: number
    height: number
    pressure: number
    tangentialPressure: number
    tiltX: number
    tiltY: number
    twist: number
    pointerType: string
    isPrimary: boolean
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 1
      this.width = params.width ?? 1
      this.height = params.height ?? 1
      this.pressure = params.pressure ?? 0
      this.tangentialPressure = params.tangentialPressure ?? 0
      this.tiltX = params.tiltX ?? 0
      this.tiltY = params.tiltY ?? 0
      this.twist = params.twist ?? 0
      this.pointerType = params.pointerType ?? 'mouse'
      this.isPrimary = params.isPrimary ?? true
    }
  }
  globalThis.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent
}
