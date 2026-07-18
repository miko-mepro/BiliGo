/// <reference types="@types/chrome" />

import type { CSMessage, SWMessage } from '../background/port-protocol.js'

export const PORT_NAME = 'bili-agent-chat'
export const PING_INTERVAL_MS = 25_000
export const PONG_TIMEOUT_MS = 60_000

export interface PortConnection {
  postMessage(msg: CSMessage): void
  onMessage(handler: (msg: SWMessage) => void): () => void
  disconnect(): void
}

export interface ConnectHandlers {
  onMessage: (msg: SWMessage) => void
  onDisconnect: () => void
}

export function connectChatPort(handlers: ConnectHandlers): PortConnection {
  const port = chrome.runtime.connect({ name: PORT_NAME })

  const messageHandlers = new Set<(msg: SWMessage) => void>()
  messageHandlers.add(handlers.onMessage)

  let pongTimer: ReturnType<typeof setTimeout> | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let disconnected = false

  const clearTimers = (): void => {
    if (pingTimer !== null) {
      clearInterval(pingTimer)
      pingTimer = null
    }
    if (pongTimer !== null) {
      clearTimeout(pongTimer)
      pongTimer = null
    }
  }

  const resetPongTimer = (): void => {
    if (pongTimer !== null) {
      clearTimeout(pongTimer)
    }
    pongTimer = setTimeout(() => {
      fireDisconnect()
    }, PONG_TIMEOUT_MS)
  }

  const fireDisconnect = (): void => {
    if (disconnected) return
    disconnected = true
    clearTimers()
    handlers.onDisconnect()
  }

  const startHeartbeat = (): void => {
    resetPongTimer()
    pingTimer = setInterval(() => {
      if (disconnected) return
      try {
        port.postMessage({ type: 'ping' } satisfies CSMessage)
      } catch {
        fireDisconnect()
      }
    }, PING_INTERVAL_MS)
  }

  const messageListener = (msg: unknown): void => {
    if (msg === null || typeof msg !== 'object') return
    const candidate = msg as SWMessage
    if (candidate.type === 'pong') {
      resetPongTimer()
      return
    }
    for (const handler of messageHandlers) {
      handler(candidate)
    }
  }

  const disconnectListener = (): void => {
    fireDisconnect()
  }

  port.onMessage.addListener(messageListener)
  port.onDisconnect.addListener(disconnectListener)

  startHeartbeat()

  return {
    postMessage(msg: CSMessage): void {
      if (disconnected) return
      try {
        port.postMessage(msg)
      } catch {
        fireDisconnect()
      }
    },
    onMessage(handler: (msg: SWMessage) => void): () => void {
      messageHandlers.add(handler)
      return () => {
        messageHandlers.delete(handler)
      }
    },
    disconnect(): void {
      if (disconnected) return
      disconnected = true
      clearTimers()
      try {
        port.disconnect()
      } catch {
        // port already disconnected
      }
    },
  }
}
