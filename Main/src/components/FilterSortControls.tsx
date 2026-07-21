import React, { useCallback } from 'react';
import type { SortField, DateFilter, DurationFilter } from '../utils/sort-filter.js'

interface FilterSortControlsProps {
  sortField: SortField;
  dateFilter: DateFilter;
  durationFilter: DurationFilter;
  onSortChange: (sortField: SortField) => void;
  onDateFilterChange: (dateFilter: DateFilter) => void;
  onDurationFilterChange: (durationFilter: DurationFilter) => void;
}

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'play', label: '播放量' },
  { value: 'pubdate', label: '发布时间' },
  { value: 'duration', label: '时长' },
  { value: 'favorites', label: '点赞数' },
];

const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'all', label: '全部时间' },
  { value: 'week', label: '一周内' },
  { value: 'month', label: '一月内' },
  { value: 'year', label: '一年内' },
];

const DURATION_OPTIONS: { value: DurationFilter; label: string }[] = [
  { value: 'all', label: '全部时长' },
  { value: 'short', label: '<5分钟' },
  { value: 'medium', label: '5-20分钟' },
  { value: 'long', label: '>20分钟' },
];

export function FilterSortControls({
  sortField,
  dateFilter,
  durationFilter,
  onSortChange,
  onDateFilterChange,
  onDurationFilterChange,
}: FilterSortControlsProps): React.ReactElement {
  const handleSortChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onSortChange(event.target.value as SortField);
    },
    [onSortChange]
  );

  const handleDateFilterChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onDateFilterChange(event.target.value as DateFilter);
    },
    [onDateFilterChange]
  );

  const handleDurationFilterChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      onDurationFilterChange(event.target.value as DurationFilter);
    },
    [onDurationFilterChange]
  );

  return (
    <div className="bili-agent-filter-sort" data-testid="filter-sort-controls">
      <div className="bili-agent-filter-sort__group">
        <label htmlFor="bili-agent-sort" className="bili-agent-filter-sort__label">
          排序
        </label>
        <select
          id="bili-agent-sort"
          className="bili-agent-filter-sort__select"
          value={sortField}
          onChange={handleSortChange}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bili-agent-filter-sort__group">
        <label htmlFor="bili-agent-date-filter" className="bili-agent-filter-sort__label">
          时间
        </label>
        <select
          id="bili-agent-date-filter"
          className="bili-agent-filter-sort__select"
          value={dateFilter}
          onChange={handleDateFilterChange}
        >
          {DATE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bili-agent-filter-sort__group">
        <label htmlFor="bili-agent-duration-filter" className="bili-agent-filter-sort__label">
          时长
        </label>
        <select
          id="bili-agent-duration-filter"
          className="bili-agent-filter-sort__select"
          value={durationFilter}
          onChange={handleDurationFilterChange}
        >
          {DURATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
