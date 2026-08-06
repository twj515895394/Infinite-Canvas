/**
 * 路由级错误边界（F16）：捕获渲染异常，避免整页白屏。
 * 数据是否安全：个人本地应用默认说明「本地数据未改动」；刷新可恢复 UI。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

interface Props {
  children: ReactNode
  /** 可选分区名，便于区分画布/设置等 */
  label?: string
  onReset?: () => void
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 个人版：控制台保留技术细节，UI 只给可操作摘要
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`, error, info.componentStack)
  }

  private reset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-full min-h-[12rem] items-center justify-center p-6">
        <EmptyState
          icon={AlertTriangle}
          title={this.props.label ? `${this.props.label} 出现异常` : '页面出现异常'}
          hint="界面渲染失败。本地项目、画布与资产数据默认未改动；可重试加载，或刷新浏览器。"
          className="max-w-md border-danger/30 bg-danger/5"
          action={
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" variant="primary" onClick={this.reset}>
                重试
              </Button>
              <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
                刷新页面
              </Button>
            </div>
          }
        />
      </div>
    )
  }
}
