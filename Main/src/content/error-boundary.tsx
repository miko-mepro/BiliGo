import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message ?? '未知错误' }
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
