import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { exportReport, type ExportableReport, type ExportFormat } from '@/features/billing/report-export';
import { api, ApiError } from '@/lib/api';
import { useClinicAuth } from '@/lib/auth';
import { notify } from '@/lib/notify';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api';

/** Rows shown on screen; exports always include every row returned by the API. */
const PREVIEW_ROWS = 500;

type CollectionsReport = {
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

type CategoryReport = {
  category: string;
  title: string;
  from: string;
  to: string;
  columns: Array<{ key: string; label: string; align?: 'left' | 'right' }>;
  rows: Array<Record<string, string | number | null>>;
  summary: Array<{ label: string; value: string }>;
  truncated: boolean;
};

type Category = 'collections' | 'invoices' | 'appointments' | 'doctors' | 'patients';

const CATEGORIES: Array<{ id: Category; label: string; description: string; managerOnly: boolean }> = [
  {
    id: 'collections',
    label: 'Collections',
    description: 'Confirmed receipts and balances for the selected date range.',
    managerOnly: false,
  },
  {
    id: 'invoices',
    label: 'Invoices',
    description: 'Every invoice in the period with totals, payments, credits and balances.',
    managerOnly: false,
  },
  {
    id: 'appointments',
    label: 'Appointments',
    description: 'Appointment details by session date: doctor, patient, queue number and status.',
    managerOnly: true,
  },
  {
    id: 'doctors',
    label: 'Doctors',
    description: 'Sessions, appointments, completed consultations and invoiced amounts per doctor.',
    managerOnly: true,
  },
  {
    id: 'patients',
    label: 'Patients',
    description: 'Patients seen or registered in the period, with visit counts and invoiced amounts.',
    managerOnly: true,
  },
];

function collectionsToExport(report: CollectionsReport, clinicName?: string | null): ExportableReport {
  const metrics: Array<[string, string]> = [
    ['Invoiced (not cash)', report.invoiced],
    ['Cash collected', report.cash],
    ['Card recorded', report.cardExternal],
    ['Bank transfers recorded', report.bankTransfer],
    ['Total collections', report.collections],
    ['Refunds', report.refunds],
    ['Credit notes', report.credits],
    ['Net collections', report.netCollections],
    ['Outstanding balances', report.outstanding],
  ];
  return {
    title: 'Collections report',
    clinicName,
    from: report.from,
    to: report.to,
    columns: [
      { key: 'metric', label: 'Metric' },
      { key: 'value', label: 'Amount (LKR)', align: 'right' },
    ],
    rows: metrics.map(([metric, value]) => ({ metric, value })),
    summary: [
      { label: 'Invoices issued', value: String(report.invoicesIssued) },
      { label: 'Payments recorded', value: String(report.paymentsRecorded) },
    ],
  };
}

export function BillingReportsPage() {
  const { user } = useClinicAuth();
  const isManager = user?.role === 'clinic_manager';
  const categories = useMemo(
    () => CATEGORIES.filter((c) => isManager || !c.managerOnly),
    [isManager],
  );

  const [category, setCategory] = useState<Category>('collections');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [collections, setCollections] = useState<CollectionsReport | null>(null);
  const [categoryReport, setCategoryReport] = useState<CategoryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(target: Category = category, start = from, end = to) {
    if (start && end && start > end) {
      setError('The From date must be on or before the To date');
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (start) params.set('from', start);
    if (end) params.set('to', end);
    try {
      if (target === 'collections') {
        const data = await api<CollectionsReport>(`/clinic/billing/reports/daily?${params.toString()}`);
        setCollections(data);
        if (!start) setFrom(data.from);
        if (!end) setTo(data.to);
      } else {
        setCategoryReport(null);
        const data = await api<CategoryReport>(
          `/clinic/billing/reports/category/${target}?${params.toString()}`,
        );
        setCategoryReport(data);
        if (!start) setFrom(data.from);
        if (!end) setTo(data.to);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Report failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load('collections');
  }, []);

  const active = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0]!;

  const exportable: ExportableReport | null =
    category === 'collections'
      ? collections
        ? collectionsToExport(collections, user?.clinicName)
        : null
      : categoryReport && categoryReport.category === category
        ? { ...categoryReport, clinicName: user?.clinicName }
        : null;

  const runExport = async (format: ExportFormat) => {
    if (!exportable) return;
    setExporting(format);
    try {
      if (category === 'collections' && format === 'csv') {
        // Keep the existing audited server-side CSV export for collections.
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        const res = await fetch(`${API_BASE}/clinic/billing/reports/export?${params.toString()}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Export failed');
        const text = await res.text();
        const blob = new Blob([text], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'hellodoc-collections.csv';
        link.click();
        URL.revokeObjectURL(url);
      } else {
        await exportReport(exportable, format);
      }
    } catch (err) {
      notify.error(err, 'Export failed');
    } finally {
      setExporting(null);
    }
  };

  const collectionRows: Array<[string, string]> = collections
    ? [
        ['Invoiced (not cash)', `LKR ${collections.invoiced}`],
        ['Cash collected', `LKR ${collections.cash}`],
        ['Card recorded', `LKR ${collections.cardExternal}`],
        ['Bank transfers recorded', `LKR ${collections.bankTransfer}`],
        ['Total collections', `LKR ${collections.collections}`],
        ['Refunds', `LKR ${collections.refunds}`],
        ['Credit notes', `LKR ${collections.credits}`],
        ['Net collections', `LKR ${collections.netCollections}`],
        ['Outstanding balances', `LKR ${collections.outstanding}`],
        ['Invoices issued', String(collections.invoicesIssued)],
        ['Payments recorded', String(collections.paymentsRecorded)],
      ]
    : [];

  const shownReport = categoryReport && categoryReport.category === category ? categoryReport : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Billing reports</h1>
        <p className="text-sm text-muted-foreground">
          Choose a report, set the date range, then export to CSV, Excel or PDF.
        </p>
      </div>

      <Tabs
        value={category}
        onValueChange={(value) => {
          const next = value as Category;
          setCategory(next);
          void load(next);
        }}
      >
        <TabsList className="h-auto flex-wrap">
          {categories.map((c) => (
            <TabsTrigger key={c.id} value={c.id}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="gap-4 border-0 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">
              {category === 'collections' ? 'Collections report' : shownReport?.title ?? `${active.label} report`}
            </CardTitle>
            <CardDescription>{active.description}</CardDescription>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void load();
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
            <Button type="submit" disabled={loading}>
              {loading ? 'Loading…' : 'Apply'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!exportable || exporting !== null}
              onClick={() => void runExport('csv')}
            >
              <Download className="mr-1.5 size-4" />
              {exporting === 'csv' ? 'Exporting…' : 'CSV'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!exportable || exporting !== null}
              onClick={() => void runExport('xlsx')}
            >
              <FileSpreadsheet className="mr-1.5 size-4" />
              {exporting === 'xlsx' ? 'Exporting…' : 'Excel'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!exportable || exporting !== null}
              onClick={() => void runExport('pdf')}
            >
              <FileText className="mr-1.5 size-4" />
              {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
            </Button>
          </form>
        </CardHeader>
        <CardContent className="px-0 pt-0 pb-0">
          {error ? <p className="px-6 py-4 text-sm text-destructive">{error}</p> : null}

          {category === 'collections' ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {collectionRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="py-10 text-center text-muted-foreground">
                        {loading ? 'Loading report…' : 'No report loaded'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    collectionRows.map(([label, value]) => (
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
              {collections ? (
                <p className="border-t border-border/50 px-6 py-4 text-sm text-muted-foreground">
                  {collections.note}
                </p>
              ) : null}
            </>
          ) : (
            <>
              {shownReport ? (
                <div className="grid grid-cols-2 gap-3 border-b border-border/50 px-6 pb-4 sm:grid-cols-3 xl:grid-cols-4">
                  {shownReport.summary.map((item) => (
                    <div key={item.label} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-sm font-semibold tabular-nums text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {/* contain:inline-size keeps wide reports scrolling inside the card instead of widening the page */}
              <div className="overflow-x-auto [contain:inline-size]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {(shownReport?.columns ?? []).map((column) => (
                        <TableHead
                          key={column.key}
                          className={column.align === 'right' ? 'text-right' : undefined}
                        >
                          {column.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!shownReport ? (
                      <TableRow>
                        <TableCell className="py-10 text-center text-muted-foreground">
                          {loading ? 'Loading report…' : 'No report loaded'}
                        </TableCell>
                      </TableRow>
                    ) : shownReport.rows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={shownReport.columns.length}
                          className="py-10 text-center text-muted-foreground"
                        >
                          No records for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      shownReport.rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                        <TableRow key={index}>
                          {shownReport.columns.map((column) => (
                            <TableCell
                              key={column.key}
                              className={
                                column.align === 'right'
                                  ? 'text-right tabular-nums whitespace-nowrap'
                                  : 'whitespace-nowrap'
                              }
                            >
                              {row[column.key] ?? ''}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {shownReport && (shownReport.rows.length > PREVIEW_ROWS || shownReport.truncated) ? (
                <p className="border-t border-border/50 px-6 py-4 text-sm text-muted-foreground">
                  {shownReport.rows.length > PREVIEW_ROWS
                    ? `Showing the first ${PREVIEW_ROWS} of ${shownReport.rows.length} rows. Exports include all rows. `
                    : ''}
                  {shownReport.truncated
                    ? 'This period has more than 5,000 records; narrow the date range to include everything.'
                    : ''}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
