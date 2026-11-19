import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

export function InvoicesPage() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<InvoiceRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Invoices</h1>
        <Button asChild>
          <Link to="/billing/invoices/new">New invoice</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Invoice, patient name, or ID" />
          <Button type="submit" variant="outline">Search</Button>
        </form>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2">Invoice</th>
                <th>Patient</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td className="py-4 text-slate-500" colSpan={6}>No invoices yet.</td></tr>
              ) : items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2">
                    <Link className="text-teal-800 underline" to={`/billing/invoices/${item.id}`}>
                      {item.invoiceNumber ?? 'Draft'}
                    </Link>
                  </td>
                  <td>{item.patientName} · {item.patientNumber}</td>
                  <td>LKR {item.invoiceTotal}</td>
                  <td>LKR {item.paid}</td>
                  <td>LKR {item.balance}</td>
                  <td>{item.status === 'ISSUED' ? item.settlement : item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
