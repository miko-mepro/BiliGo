import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { ConversationRecord } from '../lib/shared-types/index.js'
import { HistorySync } from '../lib/history/sync.js'

export interface HistoryDropdownProps {
  /** 下拉是否展开 */
  isOpen: boolean
  /** 读取历史索引（包装 getHistoryIndex） */
  getIndex: () => Promise<ConversationRecord[]>
  /** 加载某条历史对话（点击标题触发，内部已做编辑态守卫） */
  onLoad: (id: string) => Promise<void>
  /** 删除某条历史对话（点 ✕ 触发） */
  onDelete: (id: string) => Promise<void>
  /** 重命名某条历史对话（双击标题触发，回车/失焦确认） */
  onRename: (id: string, newTitle: string) => Promise<void>
  /** 清空全部历史（底部按钮触发） */
  onClearAll?: () => Promise<void>
}

/**
 * 历史标题溢出滚动组件。
 * 文字宽度超出容器时，hover 触发 CSS 滚动动画（沿用旧仓库 --overflow-width 机制）。
 */
function TitleWithScroll({ text }: { text: string }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollable, setScrollable] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // 比较实际内容宽度与可见宽度，判定是否需要滚动
    const overflow = el.scrollWidth > el.clientWidth
    setScrollable(overflow)
    if (overflow) {
      // 负偏移量驱动 keyframes 的 translateX
      el.style.setProperty('--overflow-width', `${-(el.scrollWidth - el.clientWidth)}px`)
    }
  }, [text])

  return (
    <div
      ref={ref}
      className={`bili-agent-history-item__title${scrollable ? ' bili-agent-history-item__title--scrollable' : ''}`}
    >
      {text}
    </div>
  )
}

/**
 * 将时间戳格式化为相对时间字符串（刚刚/N分钟前/N小时前/N天前/日期）。
 */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  const date = new Date(ts)
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
}

/**
 * 历史下拉面板：搜索过滤 + 四类操作（加载/删除/双击重命名/清空全部）。
 *
 * 跨标签页同步：通过 HistorySync.start 注册 onChanged 回调，
 * 自身 trackedWrite 会生成 syncId 并被去回声机制忽略，避免自身写入触发回显刷新。
 *
 * 移植自旧仓库 Backend/BiliAgent/.../HistoryDropdown.tsx，
 * 适配 Main 的真实 import（ConversationRecord / HistorySync）和样式类名（styles.ts 已含 .bili-agent-history-* 样式）。
 */
export function HistoryDropdown(props: HistoryDropdownProps): React.ReactElement | null {
  const { isOpen, getIndex, onLoad, onDelete, onRename, onClearAll } = props
  const [records, setRecords] = useState<ConversationRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  // 正在重命中的条目（双击进入编辑态）
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null)
  const editingRef = useRef(false)
  // 记录 pointerdown 时刻是否处于编辑态，用于 click 时区分"加载"与"结束编辑"
  const wasEditingOnDownRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // 持有 HistorySync 实例，组件卸载时 stop
  const syncRef = useRef<HistorySync | null>(null)

  // 展开时加载历史索引
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setLoading(true)
    getIndex()
      .then((fetchedRecords) => {
        if (!cancelled) {
          setRecords(fetchedRecords.sort((a, b) => b.lastActiveAt - a.lastActiveAt))
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[BiliAgent] history getIndex failed', err)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, getIndex])

  // 跨标签页同步：HistorySync 的去回声机制保证自身 trackedWrite 不触发回显刷新
  useEffect(() => {
    const sync = new HistorySync()
    syncRef.current = sync
    sync.start((newIndex) => {
      setRecords(newIndex.sort((a, b) => b.lastActiveAt - a.lastActiveAt))
    })
    return () => {
      sync.stop()
      syncRef.current = null
    }
  }, [])

  // 进入编辑态时自动聚焦并全选
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing?.id])

  const handleLoad = useCallback(
    async (id: string) => {
      try {
        await onLoad(id)
      } catch (err) {
        console.warn('[BiliAgent] history onLoad failed', err)
      }
    },
    [onLoad],
  )

  const handleDelete = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
      // 阻止冒泡到条目的 click（避免误触发加载）
      e.stopPropagation()
      try {
        await onDelete(id)
        setRecords((prev) => prev.filter((item) => item.id !== id))
      } catch (err) {
        console.warn('[BiliAgent] history onDelete failed', err)
      }
    },
    [onDelete],
  )

  // 双击标题进入重命名编辑态
  const handleRenameStart = useCallback(
    (e: React.MouseEvent, id: string, title: string) => {
      e.stopPropagation()
      editingRef.current = true
      setEditing({ id, title })
    },
    [],
  )

  // 回车/失焦时确认重命名
  const handleRenameConfirm = useCallback(
    async (id: string) => {
      if (!editing) return
      const newTitle = editing.title.trim()
      if (!newTitle) {
        // 空标题取消编辑
        editingRef.current = false
        setEditing(null)
        return
      }
      try {
        await onRename(id, newTitle)
        setRecords((prev) =>
          prev.map((item) => (item.id === id ? { ...item, title: newTitle } : item)),
        )
      } catch (err) {
        console.warn('[BiliAgent] history onRename failed', err)
      } finally {
        editingRef.current = false
        setEditing(null)
      }
    },
    [editing, onRename],
  )

  const handleRenameCancel = useCallback(() => {
    editingRef.current = false
    setEditing(null)
  }, [])

  const handleClearAll = useCallback(async () => {
    if (!onClearAll) return
    try {
      await onClearAll()
      setRecords([])
    } catch (err) {
      console.warn('[BiliAgent] history onClearAll failed', err)
    }
  }, [onClearAll])

  if (!isOpen) return null

  // 搜索过滤：匹配标题（大小写不敏感）
  const filtered = searchQuery.trim()
    ? records.filter((r) =>
        r.title.toLowerCase().includes(searchQuery.trim().toLowerCase()),
      )
    : records

  return (
    <div className="bili-agent-history-dropdown" role="listbox" aria-label="历史对话列表" data-no-drag>
      {/* 搜索框：过滤历史标题 */}
      <input
        className="bili-agent-history-search"
        type="text"
        placeholder="搜索历史记录"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        data-no-drag
        aria-label="搜索历史记录"
      />
      {filtered.length === 0 && !loading ? (
        <div className="bili-agent-history-empty">暂无历史记录</div>
      ) : (
        filtered.map((item) => {
          const isEditing = editing?.id === item.id
          return (
            <div
              key={item.id}
              className="bili-agent-history-item"
              onMouseDown={() => {
                wasEditingOnDownRef.current = editingRef.current
              }}
              onClick={(e) => {
                // 编辑态下的点击视为结束编辑，不触发加载
                if (wasEditingOnDownRef.current) {
                  e.stopPropagation()
                  return
                }
                void handleLoad(item.id)
              }}
              onDoubleClick={(e) => handleRenameStart(e, item.id, item.title)}
              onKeyDown={(e) => {
                if (editingRef.current) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  void handleLoad(item.id)
                }
              }}
              role="option"
              aria-selected="false"
              tabIndex={0}
            >
              <div className="bili-agent-history-item__content">
                {isEditing ? (
                  <input
                    ref={inputRef}
                    className="bili-agent-history-item__rename-input"
                    value={editing!.title}
                    onChange={(e) =>
                      setEditing((prev) => (prev ? { ...prev, title: e.target.value } : null))
                    }
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') void handleRenameConfirm(item.id)
                      if (e.key === 'Escape') handleRenameCancel()
                    }}
                    onBlur={() => void handleRenameConfirm(item.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <TitleWithScroll text={item.title} />
                )}
                <div className="bili-agent-history-item__meta">{relativeTime(item.lastActiveAt)}</div>
              </div>
              <div className="bili-agent-history-item__actions">
                <button
                  className="bili-agent-history-item__rename"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRenameStart(e, item.id, item.title)
                  }}
                  aria-label="重命名对话"
                  title="重命名"
                  type="button"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    <line x1="5" y1="20" x2="19" y2="20" />
                  </svg>
                </button>
                <button
                  className="bili-agent-history-item__delete"
                  onClick={(e) => void handleDelete(e, item.id)}
                  aria-label="删除此对话"
                  title="删除"
                  type="button"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
            </div>
          )
        })
      )}
      {/* 底部清空全部按钮 */}
      {onClearAll && records.length > 0 && (
        <button
          type="button"
          className="bili-agent-history-clear-all"
          onClick={() => void handleClearAll()}
        >
          清空全部历史
        </button>
      )}
    </div>
  )
}
