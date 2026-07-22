import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
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
    await waitFor(() => expect(props.onRename).toHaveBeenCalledWith('c1', '新名'))
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
})
