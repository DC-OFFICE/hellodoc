import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface TablePaginationProps {
  total: number;
  limit: number;
  offset: number;
  pageSizeOptions?: number[];
  onPageChange: (newOffset: number) => void;
  onLimitChange: (newLimit: number) => void;
  disabled?: boolean;
  className?: string;
}

export function TablePagination({
  total,
  limit,
  offset,
  pageSizeOptions = [10, 20, 30, 50],
  onPageChange,
  onLimitChange,
  disabled = false,
  className,
}: TablePaginationProps) {
  const safeLimit = Math.max(1, limit);
  const safeOffset = Math.max(0, offset);
  const currentPage = Math.floor(safeOffset / safeLimit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / safeLimit));

  const from = total === 0 ? 0 : safeOffset + 1;
  const to = Math.min(safeOffset + safeLimit, total);

  const canPrevious = safeOffset > 0 && !disabled;
  const canNext = safeOffset + safeLimit < total && !disabled;

  const handlePrevious = () => {
    if (!canPrevious) return;
    const nextOffset = Math.max(0, safeOffset - safeLimit);
    onPageChange(nextOffset);
  };

  const handleNext = () => {
    if (!canNext) return;
    const nextOffset = safeOffset + safeLimit;
    onPageChange(nextOffset);
  };

  const handleLimitChange = (value: string) => {
    const nextLimit = Number(value);
    if (!Number.isNaN(nextLimit) && nextLimit > 0) {
      onLimitChange(nextLimit);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-muted-foreground">Rows per page:</span>
        <Select
          value={String(safeLimit)}
          onValueChange={handleLimitChange}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 w-20 bg-background text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)} className="text-xs">
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-2 font-medium text-foreground">
          Showing {from}–{to} of {total}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-xs"
          disabled={!canPrevious}
          onClick={handlePrevious}
        >
          Previous
        </Button>
        <span className="px-2 font-medium tabular-nums text-foreground">
          Page {currentPage} of {pageCount}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2.5 text-xs"
          disabled={!canNext}
          onClick={handleNext}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
