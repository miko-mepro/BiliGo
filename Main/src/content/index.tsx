/// <reference types="@types/chrome" />

import { useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { useChat } from './chat-context.tsx'

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
    <div style={{ width: 380, height: 560, display: 'flex', flexDirection: 'column', border: '1px solid #ccc', background: '#fff' }}>
      <div style={{ padding: 8, borderBottom: '1px solid #eee', fontWeight: 600 }}>
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

function mountPanel() {
  if (document.getElementById(HOST_ID)) return

  const host = document.createElement('div')
  host.id = HOST_ID
  host.style.cssText = 'position:fixed;width:0;height:0;z-index:10000'
  document.documentElement.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })

  const root = document.createElement('div')
  shadow.appendChild(root)

  createRoot(root).render(<App />)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountPanel)
} else {
  mountPanel()
}
