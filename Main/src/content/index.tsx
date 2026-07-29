/// <reference types="@types/chrome" />

import { createRoot } from 'react-dom/client'
import { App } from '../components/App.js'
import { sheet, panelCss } from './styles.js'
import { ErrorBoundary } from './error-boundary.js'

const HOST_ID = 'bili-agent-host'

let mountedRoot: ReturnType<typeof createRoot> | null = null
let mountedHost: HTMLDivElement | null = null
let observer: MutationObserver | null = null

function mountPanel() {
  if (document.getElementById(HOST_ID)) return

  const host = document.createElement('div')
  host.id = HOST_ID
  // P1 baseline: full-viewport host (do NOT restore width:0;height:0)
  host.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
    'pointer-events:none;z-index:2147483647;'
  document.documentElement.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })

  // G4: Constructable Stylesheets injection
  try {
    shadow.adoptedStyleSheets = [sheet]
  } catch {
    // Fallback: <style> tag injection (keeps Shadow DOM isolation)
    const styleEl = document.createElement('style')
    styleEl.textContent = panelCss
    shadow.appendChild(styleEl)
  }

  const container = document.createElement('div')
  container.style.cssText = 'position:relative;width:100%;height:100%;pointer-events:none;'
  shadow.appendChild(container)

  mountedRoot = createRoot(container)
  mountedRoot.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  )
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

// 页面卸载时清理 MutationObserver，防止 SPA 长会话累积内存泄漏
window.addEventListener('pagehide', () => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})

// bfcache 恢复后重新启动 observer，防止面板丢失
window.addEventListener('pageshow', () => {
  startObserver()
})
