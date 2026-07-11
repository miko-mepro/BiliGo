/// <reference types="@types/chrome" />

const PORT_NAME = 'bili-agent-chat'

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return

  port.onMessage.addListener((msg, port) => {
    if (msg.type === 'ping') {
      port.postMessage({ type: 'pong' })
    }
  })
})

export {}
