/// <reference types="@types/chrome" />

import { useState, useEffect, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { useChat } from './chat-context.tsx'
import { ErrorBoundary } from './error-boundary.tsx'
import { SettingsPanel } from './settings-panel.tsx'
import {
  readBiliAgentSettings,
  type BiliAgentSettings,
} from '../config/settings.js'

const HOST_ID = 'bili-agent-host'

function App() {
  const { state, send, stop } = useChat()
  const [input, setInput] = useState('')

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return
    send(input)
    setInput('')
  }

  return (
    <div style={{
      position: 'fixed',
      top: 20,
      right: 80,
      width: 380,
      height: 560,
      display: 'flex',
      flexDirection: 'column',
      border: '1px solid #ccc',
      background: '#fff',
      borderRadius: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      zIndex: 2147483647,
      pointerEvents: 'auto',
    }}>
      <div style={{
        padding: 8,
        borderBottom: '1px solid #eee',
        fontWeight: 600,
      }}>
        BiliAgent
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {state.messages.length === 0 && !state.streamingContent && (
          <div style={{ color: '#999', fontSize: 13 }}>输入消息开始对话</div>
        )}
        {state.messages.map((m, i) => (
          <div
            key={i}
            style={{
              marginBottom: 8,
              textAlign: m.role === 'user' ? 'right' : 'left',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                padding: '6px 10px',
                borderRadius: 12,
                background: m.role === 'user' ? '#FB7299' : '#F0F0F0',
                color: m.role === 'user' ? '#fff' : '#18191C',
                fontSize: 14,
                maxWidth: '80%',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                textAlign: 'left',
              }}
            >
              {m.content || (m.role === 'assistant' && state.isLoading ? '...' : '')}
            </span>
          </div>
        ))}
        {state.streamingContent && (
          <div style={{ marginBottom: 8, textAlign: 'left' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '6px 10px',
                borderRadius: 12,
                background: '#F0F0F0',
                color: '#18191C',
                fontSize: 14,
                maxWidth: '80%',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                textAlign: 'left',
              }}
            >
              {state.streamingContent}
            </span>
          </div>
        )}
        {state.activity && (
          <div style={{ color: '#FB7299', fontSize: 12, marginBottom: 8 }}>
            {state.activity.kind === 'tool'
              ? `调用工具: ${state.activity.label ?? ''}`
              : state.activity.kind === 'thinking'
                ? '思考中...'
                : '回复中...'}
          </div>
        )}
        {state.error && (
          <div style={{ color: '#e53935', fontSize: 13, marginBottom: 8 }}>
            {state.error.message}
          </div>
        )}
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', padding: 8, borderTop: '1px solid #eee' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入消息..."
          style={{ flex: 1, padding: '6px 8px', border: '1px solid #ccc', borderRadius: 8, fontSize: 14 }}
        />
        {state.isLoading ? (
          <button
            type="button"
            onClick={stop}
            style={{ marginLeft: 8, padding: '6px 12px', background: '#e53935', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            停止
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            style={{ marginLeft: 8, padding: '6px 12px', background: input.trim() ? '#FB7299' : '#ccc', color: '#fff', border: 'none', borderRadius: 8, cursor: input.trim() ? 'pointer' : 'not-allowed' }}
          >
            发送
          </button>
        )}
      </form>
    </div>
  )
}

function ToggleButton({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={visible ? '收起面板' : '展开 BiliAgent'}
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: '#FB7299',
        color: '#fff',
        border: 'none',
        fontSize: 20,
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(251,114,153,0.4)',
        zIndex: 2147483647,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        lineHeight: 1,
        pointerEvents: 'auto',
      }}
    >
      {visible ? '×' : '聊'}
    </button>
  )
}

function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="配置 Provider"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 76,
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: '#fff',
        color: '#666',
        border: '1px solid #ddd',
        fontSize: 16,
        cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
        zIndex: 2147483647,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        lineHeight: 1,
        pointerEvents: 'auto',
      }}
    >
      ⚙
    </button>
  )
}

function Root() {
  const [panelVisible, setPanelVisible] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  return (
    <ErrorBoundary>
      <ToggleButton visible={panelVisible} onClick={() => setPanelVisible(v => !v)} />
      <SettingsButton onClick={() => setShowSettings(true)} />
      {panelVisible && <App />}
      {showSettings && (
        <SettingsOnlyView onClose={() => setShowSettings(false)} />
      )}
    </ErrorBoundary>
  )
}

function SettingsOnlyView({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<BiliAgentSettings | null>(null)

  useEffect(() => {
    readBiliAgentSettings().then(setSettings).catch(() => setSettings(null))
  }, [])

  if (!settings) {
    return (
      <div style={{
        position: 'fixed',
        top: 20,
        right: 20,
        padding: 12,
        background: '#fff',
        border: '1px solid #ccc',
        borderRadius: 8,
        fontSize: 12,
        color: '#999',
        zIndex: 2147483647,
        pointerEvents: 'auto',
      }}>
        加载中...
      </div>
    )
  }

  return (
    <SettingsPanel
      settings={settings}
      onClose={onClose}
      onSaved={(s) => {
        setSettings(s)
        onClose()
      }}
    />
  )
}

let mountedRoot: ReturnType<typeof createRoot> | null = null
let mountedHost: HTMLDivElement | null = null
let observer: MutationObserver | null = null

function mountPanel() {
  if (document.getElementById(HOST_ID)) return

  const host = document.createElement('div')
  host.id = HOST_ID
  host.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
    'pointer-events:none;z-index:2147483647;'
  document.documentElement.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })

  const container = document.createElement('div')
  container.style.cssText = 'position:relative;width:100%;height:100%;pointer-events:none;'
  shadow.appendChild(container)

  mountedRoot = createRoot(container)
  mountedRoot.render(<Root />)
  mountedHost = host
}

function ensureMounted(): void {
  if (mountedHost && document.documentElement.contains(mountedHost)) return
  mountedHost = null
  mountedRoot = null
  mountPanel()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    mountPanel()
    startObserver()
  })
} else {
  mountPanel()
  startObserver()
}

function startObserver(): void {
  if (observer) observer.disconnect()
  observer = new MutationObserver(() => {
    ensureMounted()
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: false,
  })
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: false,
    })
  }
}
