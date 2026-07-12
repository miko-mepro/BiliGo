import { createRoot } from 'react-dom/client'

const HOST_ID = 'bili-agent-host'

function mountPanel() {
  if (document.getElementById(HOST_ID)) return

  const host = document.createElement('div')
  host.id = HOST_ID
  host.style.cssText = 'position:fixed;width:0;height:0;z-index:10000'
  document.documentElement.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })

  const root = document.createElement('div')
  shadow.appendChild(root)

  createRoot(root).render(<div>BiliAgent loaded</div>)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountPanel)
} else {
  mountPanel()
}
