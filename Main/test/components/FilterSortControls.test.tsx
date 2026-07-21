import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FilterSortControls } from '../../src/components/FilterSortControls.js'
import type { SortField, DateFilter, DurationFilter } from '../../src/utils/sort-filter.js'

describe('FilterSortControls', () => {
  const defaultProps = {
    sortField: 'play' as SortField,
    dateFilter: 'all' as DateFilter,
    durationFilter: 'all' as DurationFilter,
    onSortChange: vi.fn(),
    onDateFilterChange: vi.fn(),
    onDurationFilterChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Rendering', () => {
    it('renders sort dropdown with default value', () => {
      render(<FilterSortControls {...defaultProps} />);

      const sortSelect = screen.getByLabelText(/排序/i);
      expect(sortSelect).toBeInTheDocument();
      expect(sortSelect).toHaveValue('play');
    });

    it('renders date filter dropdown with default value', () => {
      render(<FilterSortControls {...defaultProps} />);

      const dateSelect = screen.getByLabelText(/时间/i);
      expect(dateSelect).toBeInTheDocument();
      expect(dateSelect).toHaveValue('all');
    });

    it('renders duration filter dropdown with default value', () => {
      render(<FilterSortControls {...defaultProps} />);

      const durationSelect = screen.getByLabelText(/时长/i);
      expect(durationSelect).toBeInTheDocument();
      expect(durationSelect).toHaveValue('all');
    });

    it('has correct container CSS class', () => {
      render(<FilterSortControls {...defaultProps} />);

      const container = screen.getByTestId('filter-sort-controls');
      expect(container).toHaveClass('bili-agent-filter-sort');
    });
  });

  describe('Sort interactions', () => {
    it('calls onSortChange when sort dropdown changes', () => {
      render(<FilterSortControls {...defaultProps} />);

      const sortSelect = screen.getByLabelText(/排序/i);
      fireEvent.change(sortSelect, { target: { value: 'pubdate' } });

      expect(defaultProps.onSortChange).toHaveBeenCalledWith('pubdate');
    });

    it('calls onSortChange with favorites when selected', () => {
      render(<FilterSortControls {...defaultProps} />);

      const sortSelect = screen.getByLabelText(/排序/i);
      fireEvent.change(sortSelect, { target: { value: 'favorites' } });

      expect(defaultProps.onSortChange).toHaveBeenCalledWith('favorites');
    });

    it('calls onSortChange with duration when selected', () => {
      render(<FilterSortControls {...defaultProps} />);

      const sortSelect = screen.getByLabelText(/排序/i);
      fireEvent.change(sortSelect, { target: { value: 'duration' } });

      expect(defaultProps.onSortChange).toHaveBeenCalledWith('duration');
    });
  });

  describe('Date filter interactions', () => {
    it('calls onDateFilterChange when date filter changes to week', () => {
      render(<FilterSortControls {...defaultProps} />);

      const dateSelect = screen.getByLabelText(/时间/i);
      fireEvent.change(dateSelect, { target: { value: 'week' } });

      expect(defaultProps.onDateFilterChange).toHaveBeenCalledWith('week');
    });

    it('calls onDateFilterChange when date filter changes to month', () => {
      render(<FilterSortControls {...defaultProps} />);

      const dateSelect = screen.getByLabelText(/时间/i);
      fireEvent.change(dateSelect, { target: { value: 'month' } });

      expect(defaultProps.onDateFilterChange).toHaveBeenCalledWith('month');
    });

    it('calls onDateFilterChange when date filter changes to year', () => {
      render(<FilterSortControls {...defaultProps} />);

      const dateSelect = screen.getByLabelText(/时间/i);
      fireEvent.change(dateSelect, { target: { value: 'year' } });

      expect(defaultProps.onDateFilterChange).toHaveBeenCalledWith('year');
    });
  });

  describe('Duration filter interactions', () => {
    it('calls onDurationFilterChange when duration filter changes to short', () => {
      render(<FilterSortControls {...defaultProps} />);

      const durationSelect = screen.getByLabelText(/时长/i);
      fireEvent.change(durationSelect, { target: { value: 'short' } });

      expect(defaultProps.onDurationFilterChange).toHaveBeenCalledWith('short');
    });

    it('calls onDurationFilterChange when duration filter changes to medium', () => {
      render(<FilterSortControls {...defaultProps} />);

      const durationSelect = screen.getByLabelText(/时长/i);
      fireEvent.change(durationSelect, { target: { value: 'medium' } });

      expect(defaultProps.onDurationFilterChange).toHaveBeenCalledWith('medium');
    });

    it('calls onDurationFilterChange when duration filter changes to long', () => {
      render(<FilterSortControls {...defaultProps} />);

      const durationSelect = screen.getByLabelText(/时长/i);
      fireEvent.change(durationSelect, { target: { value: 'long' } });

      expect(defaultProps.onDurationFilterChange).toHaveBeenCalledWith('long');
    });
  });

  describe('Controlled values', () => {
    it('reflects sortField prop value', () => {
      render(<FilterSortControls {...defaultProps} sortField="pubdate" />);

      const sortSelect = screen.getByLabelText(/排序/i);
      expect(sortSelect).toHaveValue('pubdate');
    });

    it('reflects dateFilter prop value', () => {
      render(<FilterSortControls {...defaultProps} dateFilter="week" />);

      const dateSelect = screen.getByLabelText(/时间/i);
      expect(dateSelect).toHaveValue('week');
    });

    it('reflects durationFilter prop value', () => {
      render(<FilterSortControls {...defaultProps} durationFilter="short" />);

      const durationSelect = screen.getByLabelText(/时长/i);
      expect(durationSelect).toHaveValue('short');
    });
  });

  describe('Accessibility', () => {
    it('sort dropdown has accessible label', () => {
      render(<FilterSortControls {...defaultProps} />);

      const sortSelect = screen.getByLabelText(/排序/i);
      expect(sortSelect).toBeInTheDocument();
    });

    it('date filter dropdown has accessible label', () => {
      render(<FilterSortControls {...defaultProps} />);

      const dateSelect = screen.getByLabelText(/时间/i);
      expect(dateSelect).toBeInTheDocument();
    });

    it('duration filter dropdown has accessible label', () => {
      render(<FilterSortControls {...defaultProps} />);

      const durationSelect = screen.getByLabelText(/时长/i);
      expect(durationSelect).toBeInTheDocument();
    });
  });
});
