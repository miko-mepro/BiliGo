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
