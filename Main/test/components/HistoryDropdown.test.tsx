import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { HistoryDropdown } from '../../src/components/HistoryDropdown.js'
import type { ConversationRecord } from '../../src/lib/shared-types/index.js'

// HistorySync mock：避免触发真实 chrome.storage.onChanged
vi.mock('../../src/lib/history/sync.js', () => {
  return {
    HistorySync: vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      trackedWrite: vi.fn().mockResolvedValue(undefined),
    })),
  }
})

function makeRecord(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    id: 'conv_1',
    title: '测试标题1',
    titleFinal: false,
    createdAt: 1000,
    lastActiveAt: 2000,
    messageCount: 2,
    ...overrides,
  }
}

describe('HistoryDropdown', () => {
  const defaultProps = {
    isOpen: true,
    getIndex: vi.fn(() => Promise.resolve([])),
    onLoad: vi.fn(() => Promise.resolve()),
    onDelete: vi.fn(() => Promise.resolve()),
    onRename: vi.fn(() => Promise.resolve()),
    onClearAll: vi.fn(() => Promise.resolve()),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders empty state when no records', async () => {
    render(<HistoryDropdown {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByText('暂无历史记录')).toBeInTheDocument()
    })
  })

  it('renders records from getIndex', async () => {
    const records = [makeRecord({ id: 'c1', title: '历史A' }), makeRecord({ id: 'c2', title: '历史B' })]
    const props = { ...defaultProps, getIndex: vi.fn(() => Promise.resolve(records)) }
    render(<HistoryDropdown {...props} />)
    await waitFor(() => {
      expect(screen.getByText('历史A')).toBeInTheDocument()
      expect(screen.getByText('历史B')).toBeInTheDocument()
    })
  })

  it('returns null when closed', () => {
    const { container } = render(<HistoryDropdown {...defaultProps} isOpen={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('calls onLoad when clicking a record title', async () => {
    const records = [makeRecord({ id: 'c1', title: '加载我' })]
    const props = { ...defaultProps, getIndex: vi.fn(() => Promise.resolve(records)) }
    render(<HistoryDropdown {...props} />)
    await waitFor(() => expect(screen.getByText('加载我')).toBeInTheDocument())
    fireEvent.click(screen.getByText('加载我'))
    await waitFor(() => expect(props.onLoad).toHaveBeenCalledWith('c1'))
  })

  it('calls onDelete when clicking delete button', async () => {
    const records = [makeRecord({ id: 'c1', title: '删我' })]
    const props = { ...defaultProps, getIndex: vi.fn(() => Promise.resolve(records)) }
    render(<HistoryDropdown {...props} />)
    await waitFor(() => expect(screen.getByText('删我')).toBeInTheDocument())
    const deleteBtn = screen.getByLabelText('删除此对话')
    fireEvent.click(deleteBtn)
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith('c1'))
  })

  it('enters rename mode on double click and confirms on Enter', async () => {
    const records = [makeRecord({ id: 'c1', title: '原名' })]
    const props = { ...defaultProps, getIndex: vi.fn(() => Promise.resolve(records)) }
    render(<HistoryDropdown {...props} />)
    await waitFor(() => expect(screen.getByText('原名')).toBeInTheDocument())
    fireEvent.doubleClick(screen.getByText('原名'))
    const input = await screen.findByDisplayValue('原名')
    fireEvent.change(input, { target: { value: '新名' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(props.onRename).toHaveBeenCalledWith('c1', '新名')
      expect(screen.getByText('新名')).toBeInTheDocument()
    })
  })

  it('unmounted rename ignores a later rejection', async () => {
    let rejectRename: ((reason: Error) => void) | undefined
    const onRename = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectRename = reject
        }),
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const records = [makeRecord({ id: 'c1', title: '待重命名' })]
    const props = {
      ...defaultProps,
      getIndex: vi.fn(() => Promise.resolve(records)),
      onRename,
    }
    const { unmount } = render(<HistoryDropdown {...props} />)
    await waitFor(() => expect(screen.getByText('待重命名')).toBeInTheDocument())

    fireEvent.doubleClick(screen.getByText('待重命名'))
    const input = await screen.findByDisplayValue('待重命名')
    fireEvent.change(input, { target: { value: '新标题' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('c1', '新标题')

    unmount()
    await act(async () => {
      rejectRename?.(new Error('rename failed'))
      await Promise.resolve()
    })

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('filters records by search query', async () => {
    const records = [
      makeRecord({ id: 'c1', title: '鬼畜搜索' }),
      makeRecord({ id: 'c2', title: '教程查询' }),
    ]
    const props = { ...defaultProps, getIndex: vi.fn(() => Promise.resolve(records)) }
    render(<HistoryDropdown {...props} />)
    await waitFor(() => expect(screen.getByText('鬼畜搜索')).toBeInTheDocument())
    const search = screen.getByLabelText('搜索历史记录')
    fireEvent.change(search, { target: { value: '鬼畜' } })
    expect(screen.getByText('鬼畜搜索')).toBeInTheDocument()
    expect(screen.queryByText('教程查询')).not.toBeInTheDocument()
  })

  it('calls onClearAll when clicking clear all button', async () => {
    const records = [makeRecord({ id: 'c1', title: '历史1' })]
    const props = { ...defaultProps, getIndex: vi.fn(() => Promise.resolve(records)) }
    render(<HistoryDropdown {...props} />)
    await waitFor(() => expect(screen.getByText('历史1')).toBeInTheDocument())
    const clearBtn = screen.getByText('清空全部历史')
    fireEvent.click(clearBtn)
    await waitFor(() => expect(props.onClearAll).toHaveBeenCalledTimes(1))
  })

  // R-1 渲染层兜底：即使脏数据绕过上游 sanitizeHistoryIndex 校验直接进入 records，
  // 搜索过滤也不得因 r.title.toLowerCase() 抛出 TypeError 而触发错误边界
  describe('搜索过滤的非字符串 title 防御（R-1）', () => {
    // 绕过 ConversationRecord 类型约束模拟运行时脏数据
    function makeDirtyRecord(id: string, title: unknown): ConversationRecord {
      return { ...makeRecord({ id }), title } as unknown as ConversationRecord
    }

    it.each([
      ['null', null],
      ['数字', 123],
      ['对象', {}],
      ['undefined', undefined],
      ['布尔值', true],
    ])('title 为 %s 时输入搜索关键词不抛 TypeError，该记录被过滤', async (_label, title) => {
      const records = [makeDirtyRecord('c1', title), makeRecord({ id: 'c2', title: '正常标题' })]
      const props = { ...defaultProps, getIndex: vi.fn(() => Promise.resolve(records)) }
      render(<HistoryDropdown {...props} />)
      await waitFor(() => expect(screen.getByText('正常标题')).toBeInTheDocument())

      const search = screen.getByLabelText('搜索历史记录')
      // 输入非空字符会进入 records.filter 分支，是原崩溃链路的触发点
      expect(() => fireEvent.change(search, { target: { value: 'x' } })).not.toThrow()
      // 未触发错误边界降级 UI，说明 render 未抛错
      expect(screen.queryByText(/渲染异常/)).not.toBeInTheDocument()
    })

    it('title 字段缺失时不抛错', async () => {
      const noTitle = { ...makeRecord({ id: 'c1' }) } as Partial<ConversationRecord>
      delete noTitle.title
      const props = {
        ...defaultProps,
        getIndex: vi.fn(() => Promise.resolve([noTitle as ConversationRecord])),
      }
      render(<HistoryDropdown {...props} />)
      const search = await screen.findByLabelText('搜索历史记录')
      expect(() => fireEvent.change(search, { target: { value: 'x' } })).not.toThrow()
    })

    it('混合记录搜索时只匹配合法 title，脏数据记录被排除', async () => {
      const records = [
        makeRecord({ id: 'c1', title: 'ok' }),
        makeDirtyRecord('c2', null),
      ]
      const props = { ...defaultProps, getIndex: vi.fn(() => Promise.resolve(records)) }
      render(<HistoryDropdown {...props} />)
      await waitFor(() => expect(screen.getByText('ok')).toBeInTheDocument())

      const search = screen.getByLabelText('搜索历史记录')
      fireEvent.change(search, { target: { value: 'ok' } })
      expect(screen.getByText('ok')).toBeInTheDocument()
    })

    it('搜索框为空时脏数据记录仍可展示（不走 filter 分支）', async () => {
      const records = [makeDirtyRecord('c1', null), makeRecord({ id: 'c2', title: '正常标题' })]
      const props = { ...defaultProps, getIndex: vi.fn(() => Promise.resolve(records)) }
      render(<HistoryDropdown {...props} />)
      await waitFor(() => expect(screen.getByText('正常标题')).toBeInTheDocument())
      expect(screen.queryByText(/渲染异常/)).not.toBeInTheDocument()
    })

    it('搜索词为纯空白时不进入过滤分支，全部记录保留', async () => {
      const records = [makeDirtyRecord('c1', null), makeRecord({ id: 'c2', title: '正常标题' })]
      const props = { ...defaultProps, getIndex: vi.fn(() => Promise.resolve(records)) }
      render(<HistoryDropdown {...props} />)
      await waitFor(() => expect(screen.getByText('正常标题')).toBeInTheDocument())

      const search = screen.getByLabelText('搜索历史记录')
      expect(() => fireEvent.change(search, { target: { value: '   ' } })).not.toThrow()
      expect(screen.getByText('正常标题')).toBeInTheDocument()
    })

    // 第二条崩溃路径：对象类型 title 会被当作 React child 渲染，
    // 打开下拉即抛 "Objects are not valid as a React child"，无需输入搜索词。
    // 修复方案原文只分析了 toLowerCase 路径，此用例锁定该补充路径不回归。
    it('title 为对象时仅打开下拉（不搜索）也不触发渲染崩溃', async () => {
      const records = [makeDirtyRecord('c1', {}), makeRecord({ id: 'c2', title: '正常标题' })]
      const props = { ...defaultProps, getIndex: vi.fn(() => Promise.resolve(records)) }
      render(<HistoryDropdown {...props} />)
      await waitFor(() => expect(screen.getByText('正常标题')).toBeInTheDocument())
      expect(screen.queryByText(/渲染异常/)).not.toBeInTheDocument()
    })

    it('title 为数组时仅打开下拉也不触发渲染崩溃', async () => {
      const records = [makeDirtyRecord('c1', ['x']), makeRecord({ id: 'c2', title: '正常标题' })]
      const props = { ...defaultProps, getIndex: vi.fn(() => Promise.resolve(records)) }
      render(<HistoryDropdown {...props} />)
      await waitFor(() => expect(screen.getByText('正常标题')).toBeInTheDocument())
      expect(screen.queryByText(/渲染异常/)).not.toBeInTheDocument()
    })
  })
})
