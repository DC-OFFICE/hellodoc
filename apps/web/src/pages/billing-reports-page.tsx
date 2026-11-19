import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    void load().catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Report failed'));
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
    <Card className="shadow-none">
      <CardHeader><h1 className="text-xl font-semibold">Daily collections</h1></CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void load().catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Report failed'));
          }}
        >
          <div>
            <Label>From</Label>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <Button type="submit" variant="outline">Apply</Button>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              const params = new URLSearchParams();
              if (from) params.set('from', from);
              if (to) params.set('to', to);
              const res = await fetch(`${API_BASE}/clinic/billing/reports/export?${params.toString()}`, {
                credentials: 'include',
              });
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
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <dl className="grid gap-2 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-md border px-3 py-2">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {report ? <p className="text-sm text-slate-600">{report.note}</p> : null}
      </CardContent>
    </Card>
  );
}
