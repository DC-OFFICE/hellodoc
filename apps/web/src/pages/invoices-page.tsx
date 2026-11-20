import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { InvoiceFormDialog } from '@/components/invoice-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';

type InvoiceRow = {
  id: string;
  invoiceNumber: string | null;
  patientName: string;
  patientNumber: string;
  status: string;
  invoiceTotal: string;
  paid: string;
  balance: string;
  settlement: string;
};

function statusTone(status: string, settlement: string) {
  const value = status === 'ISSUED' ? settlement : status;
  if (value === 'PAID' || value === 'SETTLED') return 'active' as const;
  if (value === 'PARTIAL' || value === 'ISSUED') return 'pending' as const;
  if (value === 'VOID' || value === 'CANCELLED') return 'suspended' as const;
  return 'default' as const;
}

export function InvoicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<InvoiceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const openCreate = useCallback(() => setCreateOpen(true), []);

  const closeCreate = useCallback(
    (open: boolean) => {
      setCreateOpen(open);
      if (!open) {
        const next = new URLSearchParams(searchParams);
        next.delete('create');
        setSearchParams(next, { replace: true });
      }
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (searchParams.get('create') === '1') openCreate();
  }, [searchParams, openCreate]);

  async function load(search = q) {
    setError(null);
    try {
      const data = await api<{ items: InvoiceRow[] }>(
        `/clinic/invoices${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`,
      );
      setItems(data.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load invoices');
    }
  }

  useEffect(() => {
    void load('');
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Review clinic invoices, balances, and settlement status.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="size-4" />
          New invoice
        </Button>
      </div>

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="gap-4 border-0 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Invoice list</CardTitle>
            <CardDescription>Search by invoice number, patient name, or ID.</CardDescription>
          </div>
          <form
            className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
            onSubmit={(event) => {
              event.preventDefault();
              void load();
            }}
          >
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Invoice, patient name, or ID"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </CardHeader>
        <CardContent className="px-0 pt-0 pb-0">
          {error ? <p className="px-6 py-4 text-sm text-destructive">{error}</p> : null}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Invoice</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const label = item.status === 'ISSUED' ? item.settlement : item.status;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <Link
                          className="text-primary hover:underline"
                          to={`/billing/invoices/${item.id}`}
                        >
                          {item.invoiceNumber ?? 'Draft'}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.patientName}
                        <span className="mt-0.5 block font-mono text-xs">
                          {item.patientNumber}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums font-medium">
                        LKR {item.invoiceTotal}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        LKR {item.paid}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        LKR {item.balance}
                      </TableCell>
                      <TableCell>
                        <Badge tone={statusTone(item.status, item.settlement)}>{label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <InvoiceFormDialog
        open={createOpen}
        onOpenChange={closeCreate}
        onCreated={() => void load('')}
      />
    </div>
  );
}
