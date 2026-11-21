import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, Plus, Search, Store } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PosRegister } from '@/features/billing/components/PosRegister';
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
  const activeTab = searchParams.get('tab') === 'pos' ? 'pos' : 'invoices';

  const [q, setQ] = useState('');
  const [items, setItems] = useState<InvoiceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const handleTabChange = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val === 'pos') {
      next.set('tab', 'pos');
    } else {
      next.delete('tab');
    }
    setSearchParams(next, { replace: true });
  };

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
      {/* Page Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Invoicing & POS</h1>
          <p className="text-sm text-muted-foreground">
            Review clinic invoices, track settlements, or process rapid front-desk point-of-sale checkouts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleTabChange(activeTab === 'pos' ? 'invoices' : 'pos')}
            className="gap-1.5 cursor-pointer text-xs"
          >
            {activeTab === 'pos' ? (
              <>
                <FileText className="size-3.5" />
                View Invoices Table
              </>
            ) : (
              <>
                <Store className="size-3.5" />
                Open POS Register
              </>
            )}
          </Button>
          <Button type="button" size="sm" onClick={openCreate} className="gap-1.5 cursor-pointer text-xs">
            <Plus className="size-3.5" />
            New invoice
          </Button>
        </div>
      </div>

      {/* Tabs Container */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="invoices" className="gap-1.5 cursor-pointer text-xs">
            <FileText className="size-4" />
            <span>Invoices</span>
          </TabsTrigger>
          <TabsTrigger value="pos" className="gap-1.5 cursor-pointer text-xs">
            <Store className="size-4" />
            <span>POS Register</span>
          </TabsTrigger>
        </TabsList>

        {/* ======================================================== */}
        {/* TAB 1: Invoices Historical Table                         */}
        {/* ======================================================== */}
        <TabsContent value="invoices" className="space-y-4 outline-none">
          <Card className="overflow-hidden shadow-none border-border">
            <CardHeader className="gap-4 border-0 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold">Invoice list</CardTitle>
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
                    className="pl-8 text-xs"
                  />
                </div>
                <Button type="submit" variant="secondary" size="sm" className="cursor-pointer text-xs">
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
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                        <FileText className="size-6 opacity-30 mx-auto mb-2" />
                        <p className="font-medium text-sm">No invoices found</p>
                        <p className="text-xs">Create an invoice or switch to POS to record a checkout.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item) => {
                      const label = item.status === 'ISSUED' ? item.settlement : item.status;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            <Link
                              className="text-primary hover:underline font-mono text-xs"
                              to={`/billing/invoices/${item.id}`}
                            >
                              {item.invoiceNumber ?? 'Draft'}
                            </Link>
                          </TableCell>
                          <TableCell className="text-foreground">
                            <div className="font-medium text-sm">{item.patientName}</div>
                            <span className="font-mono text-xs text-muted-foreground">
                              {item.patientNumber}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold font-mono text-xs">
                            LKR {item.invoiceTotal}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground font-mono text-xs">
                            LKR {item.paid}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground font-mono text-xs">
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
        </TabsContent>

        {/* ======================================================== */}
        {/* TAB 2: Point of Sale (POS) Counter UI                    */}
        {/* ======================================================== */}
        <TabsContent value="pos" className="space-y-4 outline-none">
          <PosRegister
            onInvoiceCreated={() => void load('')}
            onSwitchToInvoices={() => handleTabChange('invoices')}
          />
        </TabsContent>
      </Tabs>

      <InvoiceFormDialog
        open={createOpen}
        onOpenChange={closeCreate}
        onCreated={() => void load('')}
      />
    </div>
  );
}
