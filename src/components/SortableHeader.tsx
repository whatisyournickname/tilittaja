'use client';

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

interface SortableHeaderProps<K extends string> {
  label: string;
  sortKey: K;
  current: SortState<K> | null;
  onSort: (key: K) => void;
  align?: 'left' | 'right';
  className?: string;
  style?: CSSProperties;
  onResizePointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeDoubleClick?: () => void;
}

export function SortableHeader<K extends string>({
  label,
  sortKey,
  current,
  onSort,
  align = 'left',
  className = '',
  style,
  onResizePointerDown,
  onResizeDoubleClick,
}: SortableHeaderProps<K>) {
  const isActive = current?.key === sortKey;
  const direction = isActive ? current.direction : null;

  const Icon =
    direction === 'asc'
      ? ChevronUp
      : direction === 'desc'
        ? ChevronDown
        : ChevronsUpDown;

  return (
    <th
      className={`relative text-[10px] font-semibold uppercase tracking-[0.15em] px-3 py-2 select-none group transition-colors hover:text-text-primary ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${isActive ? 'text-text-primary' : 'text-text-muted'} ${className}`}
      style={style}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex w-full items-center gap-1 bg-transparent text-inherit min-h-[32px] ${
          align === 'right'
            ? 'justify-end text-right'
            : 'justify-start text-left'
        }`}
      >
        <span
          className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}
        >
          {label}
          <Icon
            className={`h-3 w-3 shrink-0 ${isActive ? 'text-accent' : 'text-text-muted opacity-0 group-hover:opacity-100'} transition-opacity`}
          />
        </span>
      </button>
      {onResizePointerDown ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize column ${label} width`}
          title="Drag to resize. Double-click to reset."
          className="absolute inset-y-0 right-0 z-10 w-3 cursor-col-resize touch-none after:absolute after:bottom-2 after:right-1.5 after:top-2 after:w-px after:bg-white/10 after:transition-colors hover:after:bg-accent/60"
          onPointerDown={onResizePointerDown}
          onDoubleClick={onResizeDoubleClick}
        />
      ) : null}
    </th>
  );
}

export function toggleSort<K extends string>(
  current: SortState<K> | null,
  key: K,
): SortState<K> {
  if (current?.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: 'asc' };
}
