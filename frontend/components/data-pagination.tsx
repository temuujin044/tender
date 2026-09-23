'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type PageItem = number | 'start-ellipsis' | 'end-ellipsis';

function pageItems(page: number, pageCount: number): PageItem[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const visible = Array.from(pages)
    .filter((item) => item >= 1 && item <= pageCount)
    .sort((a, b) => a - b);
  const result: PageItem[] = [];
  visible.forEach((item, index) => {
    const previous = visible[index - 1];
    if (previous && item - previous > 1)
      result.push(previous === 1 ? 'start-ellipsis' : 'end-ellipsis');
    result.push(item);
  });
  return result;
}

export function DataPagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  itemLabel = 'мөр',
  busy = false,
  compact = false,
  className,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  busy?: boolean;
  compact?: boolean;
  className?: string;
}) {
  if (totalItems === 0) return null;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(page, 1), pageCount);
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="tabular-nums">
          Нийт {totalItems} {itemLabel} · {start}–{end}
        </span>
        {onPageSizeChange && (
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
            disabled={busy}
          >
            <SelectTrigger className="h-8 w-[94px] bg-white text-xs" aria-label="Нэг хуудсанд">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / хуудас
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Pagination className="mx-0 w-auto justify-start sm:justify-end">
        <PaginationContent>
          <PaginationItem>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2"
              disabled={busy || currentPage <= 1}
              aria-label="Өмнөх хуудас"
              onClick={() => onPageChange(currentPage - 1)}
            >
              <ChevronLeft className="size-4" />
              <span className={cn('hidden', !compact && 'md:inline')}>Өмнөх</span>
            </Button>
          </PaginationItem>
          {!compact &&
            pageItems(currentPage, pageCount).map((item) => (
              <PaginationItem key={item} className="hidden sm:block">
                {typeof item === 'number' ? (
                  <Button
                    variant={item === currentPage ? 'outline' : 'ghost'}
                    size="icon-sm"
                    className={cn('tabular-nums', item === currentPage && 'bg-slate-50')}
                    aria-label={`${item}-р хуудас`}
                    aria-current={item === currentPage ? 'page' : undefined}
                    disabled={busy}
                    onClick={() => onPageChange(item)}
                  >
                    {item}
                  </Button>
                ) : (
                  <span className="flex size-8 items-center justify-center text-slate-400">…</span>
                )}
              </PaginationItem>
            ))}
          {compact && (
            <PaginationItem>
              <span className="flex h-8 items-center px-2 text-xs tabular-nums text-slate-500">
                {currentPage} / {pageCount}
              </span>
            </PaginationItem>
          )}
          <PaginationItem>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2"
              disabled={busy || currentPage >= pageCount}
              aria-label="Дараах хуудас"
              onClick={() => onPageChange(currentPage + 1)}
            >
              <span className={cn('hidden', !compact && 'md:inline')}>Дараах</span>
              <ChevronRight className="size-4" />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
