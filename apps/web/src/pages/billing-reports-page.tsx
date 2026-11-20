import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

type Report = {
  from: string;
  to: string;
  invoiced: string;
  cash: string;
  cardExternal: string;
  bankTransfer: string;
  collections: string;
  refunds: string;
  credits: string;
  netCollections: string;
  outstanding: string;
  invoicesIssued: number;
  paymentsRecorded: number;
  note: string;
};

export function BillingReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(start = from, end = to) {
    const params = new URLSearchParams();
    if (start) params.set('from', start);
    if (end) params.set('to', end);
    const data = await api<Report>(`/clinic/billing/reports/daily?${params.toString()}`);
    setReport(data);
    if (!start) setFrom(data.from);
    if (!end) setTo(data.to);
  }

  useEffect(() => {
    void load().catch((err: unknown) =>
      setError(err instanceof ApiError ? err.message : 'Report failed'),
    );
  }, []);

  const rows: Array<[string, string]> = report
    ? [
        ['Invoiced (not cash)', `LKR ${report.invoiced}`],
        ['Cash collected', `LKR ${report.cash}`],
        ['Card recorded', `LKR ${report.cardExternal}`],
        ['Bank transfers recorded', `LKR ${report.bankTransfer}`],
        ['Total collections', `LKR ${report.collections}`],
        ['Refunds', `LKR ${report.refunds}`],
        ['Credit notes', `LKR ${report.credits}`],
        ['Net collections', `LKR ${report.netCollections}`],
        ['Outstanding balances', `LKR ${report.outstanding}`],
        ['Invoices issued', String(report.invoicesIssued)],
        ['Payments recorded', String(report.paymentsRecorded)],
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Daily collections</h1>
        <p className="text-sm text-muted-foreground">
          Confirmed receipts and balances for the selected date range.
        </p>
      </div>

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="gap-4 border-0 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Collections report</CardTitle>
            <CardDescription>Filter by date, then export if needed.</CardDescription>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void load().catch((err: unknown) =>
                setError(err instanceof ApiError ? err.message : 'Report failed'),
              );
            }}
          >
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
            <Button type="submit">Apply</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const params = new URLSearchParams();
                if (from) params.set('from', from);
                if (to) params.set('to', to);
                const res = await fetch(
                  `${API_BASE}/clinic/billing/reports/export?${params.toString()}`,
                  { credentials: 'include' },
                );
                const text = await res.text();
                const blob = new Blob([text], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'hellodoc-collections.csv';
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export CSV
            </Button>
          </form>
        </CardHeader>
        <CardContent className="px-0 pt-0 pb-0">
          {error ? <p className="px-6 py-4 text-sm text-destructive">{error}</p> : null}
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-10 text-center text-muted-foreground">
                    Loading report…
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(([label, value]) => (
                  <TableRow key={label}>
                    <TableCell className="text-muted-foreground">{label}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-foreground">
                      {value}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {report ? (
            <p className="border-t border-border/50 px-6 py-4 text-sm text-muted-foreground">
              {report.note}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
