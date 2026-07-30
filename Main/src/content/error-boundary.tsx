import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

/**
 * TODO-19：异常信息脱敏。
 * 错误 message 中可能含敏感凭据（如 API key、Bearer token、B 站 cookie），
 * 落地到用户可见的 fallback UI 前先正则替换为 [REDACTED]，避免明文泄露。
 *
 * 覆盖三类常见敏感串：
 *  - OpenAI 风格 key：sk- 开头后跟至少 8 位字母数字/下划线/连字符
 *  - Authorization Bearer token：Bearer 后跟非空白串
 *  - B 站 SESSDATA cookie：SESSDATA= 后跟非空白/非分号串
 */
function redactText(input: string): string {
  return input
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, '[REDACTED]')
    .replace(/SESSDATA=[^;\s]+/gi, '[REDACTED]')
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // TODO-19：脱敏后再写入 state，避免凭据明文出现在 fallback UI
    return { hasError: true, message: redactText(error.message ?? '未知错误') }
  }

  componentDidCatch(_error: Error, info: ErrorInfo): void {
    console.error('[BiliAgent] ErrorBoundary caught:', info)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div style={{
          position: 'fixed',
          bottom: 80,
          right: 20,
          width: 240,
          padding: 12,
          background: '#fff',
          border: '1px solid #e53935',
          borderRadius: 8,
          fontSize: 12,
          color: '#e53935',
          zIndex: 2147483647,
          pointerEvents: 'auto',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>BiliAgent 渲染异常</div>
          <div style={{ wordBreak: 'break-word' }}>{this.state.message}</div>
        </div>
      )
    }
    return this.props.children
  }
}
