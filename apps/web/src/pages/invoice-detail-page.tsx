import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError, openProtectedDocument } from '@/lib/api';

type Invoice = {
  id: string;
  invoiceNumber: string | null;
  status: string;
  patientName: string;
  patientNumber: string;
  invoiceTotal: string;
  paid: string;
  balance: string;
  settlement: string;
  excessToReconcile: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  items: Array<{ description: string; quantity: number; unitPrice: string; lineTotal: string }>;
  payments: Array<{ id: string; receipt_number: string; amount: string; method: string }>;
};

export function InvoiceDetailPage() {
  const { id = '' } = useParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const payKey = useRef(crypto.randomUUID());

  async function load() {
    const data = await api<Invoice>(`/clinic/invoices/${id}`);
    setInvoice(data);
    setAmount(data.balance);
  }

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Invoice not found');
    });
  }, [id]);

  if (!invoice) return <p className="text-sm text-slate-600">{error ?? 'Loading invoice…'}</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card className="shadow-none">
        <CardHeader>
          <h1 className="text-xl font-semibold">{invoice.invoiceNumber ?? 'Draft invoice'}</h1>
          <p className="text-sm text-slate-600">{invoice.patientName} · {invoice.patientNumber}</p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Status: {invoice.status} · Settlement: {invoice.settlement}</p>
          <p>Subtotal LKR {invoice.subtotal} · Discount LKR {invoice.discountTotal} · Tax LKR {invoice.taxTotal}</p>
          <p>Total LKR {invoice.invoiceTotal} · Paid LKR {invoice.paid} · Balance LKR {invoice.balance}</p>
          {invoice.excessToReconcile !== '0.00' ? (
            <p className="text-amber-800">Excess received LKR {invoice.excessToReconcile}. Review a refund. Payments were not rewritten.</p>
          ) : null}
          <table className="w-full">
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.description} className="border-b">
                  <td className="py-2">{item.description} × {item.quantity}</td>
                  <td className="text-right">LKR {item.lineTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2">
            {invoice.status === 'DRAFT' ? (
              <Button
                type="button"
                onClick={async () => {
                  setError(null);
                  try {
                    const issued = await api<Invoice>(`/clinic/invoices/${id}/issue`, { method: 'POST', json: {} });
                    setInvoice(issued);
                    setMessage(`Issued ${issued.invoiceNumber}`);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'Could not issue invoice');
                  }
                }}
              >
                Issue invoice
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => void openProtectedDocument(`/clinic/invoices/${id}/print`)}>
              Print
            </Button>
          </div>
          {invoice.payments.map((payment) => (
            <p key={payment.id}>
              {payment.receipt_number} · {payment.method} · LKR {payment.amount}{' '}
              <button className="text-teal-800 underline" type="button" onClick={() => void openProtectedDocument(`/clinic/payments/${payment.id}/receipt`)}>
                Reprint receipt
              </button>
            </p>
          ))}
          {error ? <p className="text-red-700">{error}</p> : null}
          {message ? <p className="text-teal-800">{message}</p> : null}
        </CardContent>
      </Card>
      {invoice.status === 'ISSUED' && invoice.balance !== '0.00' ? (
        <Card className="shadow-none">
          <CardHeader><h2 className="font-semibold">Record payment</h2></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="payment-amount">Amount</Label>
              <Input
                id="payment-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="payment-method">Method</Label>
              <select
                id="payment-method"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="CASH">Cash</option>
                <option value="CARD_EXTERNAL">Card (external terminal)</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
              </select>
            </div>
            <Button
              type="button"
              onClick={async () => {
                setError(null);
                try {
                  const paid = await api<Invoice>(`/clinic/invoices/${id}/payments`, {
                    method: 'POST',
                    json: { amount, method, idempotencyKey: payKey.current },
                  });
                  payKey.current = crypto.randomUUID();
                  setInvoice(paid);
                  setAmount(paid.balance);
                  setMessage('Payment recorded');
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : 'Payment was not recorded');
                }
              }}
            >
              Confirm payment
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
