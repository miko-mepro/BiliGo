import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AgentInsightCard } from '../../src/components/AgentInsightCard.js'
import type {
  ClarificationRequest,
  QueryExpandResult,
  RerankResult,
  SlangUnderstandResult,
} from '../../src/lib/shared-types/index.js'

describe('AgentInsightCard', () => {
  const understanding: SlangUnderstandResult = {
    original: '想看老番神回',
    normalized: '经典动画高评分单集解说',
    explanation: '“神回”表示高质量单集。',
    matchedDict: true,
  };

  const expansion: QueryExpandResult = {
    keywords: ['经典动画', '神回'],
    tags: ['动漫杂谈', '补番'],
    categories: ['番剧', '动画'],
    rationale: '从口语描述扩展出 B 站常见搜索词。',
  };

  const rerank: RerankResult = {
    items: [{ bvid: 'BV1xx411c7mD', score: 0.92, reason: '标题匹配' }],
    strategy: 'llm',
    trimmed: 3,
  };

  const clarification: ClarificationRequest = {
    question: '你更想看哪类内容？',
    options: ['解说', '剪辑'],
    reason: '当前描述可以匹配多个方向。',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders understanding collapsed by default and expands on title click', () => {
    render(<AgentInsightCard kind="understanding" data={understanding} />);

    const button = screen.getByRole('button', { name: /AI 理解/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(understanding.original)).not.toBeInTheDocument();

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(understanding.original)).toBeInTheDocument();
    expect(screen.getByText(understanding.normalized)).toBeInTheDocument();
    expect(screen.getByText(understanding.explanation)).toBeInTheDocument();
  });

  it('renders expansion collapsed by default and expands on title click', () => {
    render(<AgentInsightCard kind="expansion" data={expansion} />);

    const button = screen.getByRole('button', { name: /搜索词扩展/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('经典动画')).not.toBeInTheDocument();

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('经典动画')).toBeInTheDocument();
    expect(screen.getByText('动漫杂谈')).toBeInTheDocument();
    expect(screen.getByText('番剧')).toBeInTheDocument();
    expect(screen.getByText(expansion.rationale)).toBeInTheDocument();
  });

  it('renders rerank collapsed by default and expands on title click', () => {
    render(<AgentInsightCard kind="rerank" data={rerank} />);

    const button = screen.getByRole('button', { name: /智能排序/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('LLM 智能排序')).not.toBeInTheDocument();

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('LLM 智能排序')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders clarification collapsed by default, expands on click, and calls onAnswer with option', () => {
    const onAnswer = vi.fn();
    render(<AgentInsightCard kind="clarification" data={clarification} onAnswer={onAnswer} />);

    const button = screen.getByRole('button', { name: /请帮我确认/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(clarification.question)).not.toBeInTheDocument();

    fireEvent.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(clarification.question)).toBeInTheDocument();
    expect(screen.getByText(clarification.reason)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '解说' }));

    expect(onAnswer).toHaveBeenCalledWith('解说');
  });
});
