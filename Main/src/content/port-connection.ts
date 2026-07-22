/// <reference types="@types/chrome" />

import { isSWMessage, type CSMessage, type SWMessage } from '../background/port-protocol.js'

export const PORT_NAME = 'bili-agent-chat'
export const PING_INTERVAL_MS = 25_000
export const PONG_TIMEOUT_MS = 60_000

export interface PortConnection {
  postMessage(msg: CSMessage): void
  onMessage(handler: (msg: SWMessage) => void): () => void
  disconnect(): void
  /** 修复 #5：暴露断线状态，供上层在发送前判断连接是否可用 */
  isDisconnected(): boolean
}

export interface ConnectHandlers {
  onMessage: (msg: SWMessage) => void
  onDisconnect: () => void
}

export function connectChatPort(handlers: ConnectHandlers): PortConnection {
  let port: chrome.runtime.Port
  try {
    port = chrome.runtime.connect({ name: PORT_NAME })
  } catch {
    handlers.onDisconnect()
    return {
      postMessage(): void {},
      onMessage(): () => void {
        return () => {}
      },
      disconnect(): void {},
      isDisconnected(): boolean {
        return true
      },
    }
  }

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
    // 修复 #2：入口处用 isSWMessage 做运行时校验，非法消息（如 videos:null）直接丢弃，
    // 避免残缺数据流入 reducer 后在渲染层崩溃
    if (!isSWMessage(msg)) return
    if (msg.type === 'pong') {
      resetPongTimer()
      return
    }
    for (const handler of messageHandlers) {
      handler(msg)
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
    isDisconnected(): boolean {
      return disconnected
    },
  }
}
