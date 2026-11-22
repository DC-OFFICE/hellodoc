import { useEffect, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApiError, fetchProtectedDocumentHtml } from '@/lib/api';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

type PrintDocumentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string | null;
  title?: string;
  description?: string;
};

export function PrintDocumentDialog({
  open,
  onOpenChange,
  path,
  title = 'Print preview',
  description = 'Review the document below, then print or save it as a PDF.',
}: PrintDocumentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!open || !path) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHtml(null);
    void fetchProtectedDocumentHtml(path)
      .then((documentHtml) => {
        if (!cancelled) setHtml(documentHtml);
      })
      .catch((err) => {
        if (!cancelled) {
          const message =
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Unable to load document';
          setError(message);
          notify.error(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, path]);

  const handlePrint = () => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(960px,calc(100%-2rem))] max-w-none flex-col gap-4 sm:max-w-none">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
          {loading ? <p className="p-6 text-sm text-muted-foreground">Loading printable document…</p> : null}
          {error ? <p className="p-6 text-sm text-destructive">{error}</p> : null}
          {html ? (
            <iframe
              ref={frameRef}
              title={title}
              srcDoc={html}
              className="h-[min(70vh,720px)] w-full bg-white"
            />
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="text-xs text-muted-foreground">
            In the print dialog, choose Save as PDF to download a PDF copy.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              type="button"
              disabled={!html || loading}
              className="gap-1.5 text-white hover:text-white"
              onClick={handlePrint}
            >
              <Printer className="size-3.5" />
              Print / Save PDF
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PrintDocumentButtonProps = {
  path: string;
  label?: string;
  title?: string;
  description?: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
  className?: string;
  disabled?: boolean;
};

export function PrintDocumentButton({
  path,
  label = 'Print bill',
  title = 'Print preview',
  description = 'Review the document below, then print or save it as a PDF.',
  variant = 'outline',
  size = 'sm',
  className,
  disabled,
}: PrintDocumentButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        className={cn('gap-1.5', className)}
        onClick={() => setOpen(true)}
      >
        <Printer className="size-3.5" />
        {label}
      </Button>
      <PrintDocumentDialog
        open={open}
        onOpenChange={setOpen}
        path={path}
        title={title}
        description={description}
      />
    </>
  );
}
