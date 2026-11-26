import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PrintDocumentButton } from '@/components/print-document-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';

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
  patientId: string;
  appointmentId: string | null;
  version: number;
  items: Array<{
    serviceId: string | null;
    description: string;
    quantity: number;
    unitPrice: string;
    discount: string;
    lineTotal: string;
  }>;
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
  // Draft line prices (e.g. medicines added automatically from a signed prescription at 0.00).
  const [draftPrices, setDraftPrices] = useState<string[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);

  function showInvoice(data: Invoice) {
    setInvoice(data);
    setDraftPrices(data.items.map((item) => item.unitPrice));
  }

  async function load() {
    const data = await api<Invoice>(`/clinic/invoices/${id}`);
    showInvoice(data);
    setAmount(data.balance);
  }

  async function saveDraftPrices(current: Invoice) {
    const invalid = draftPrices.findIndex((price) => !/^\d+(\.\d{1,2})?$/.test(price.trim()));
    if (invalid >= 0) {
      setError(`Line ${invalid + 1}: enter a price such as 250 or 250.00`);
      return;
    }
    setSavingDraft(true);
    setError(null);
    try {
      const saved = await api<Invoice>(`/clinic/invoices/${id}/draft`, {
        method: 'PATCH',
        json: {
          patientId: current.patientId,
          appointmentId: current.appointmentId ?? undefined,
          version: current.version,
          items: current.items.map((item, index) => ({
            serviceId: item.serviceId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: draftPrices[index]!.trim(),
            discount: item.discount,
          })),
        },
      });
      showInvoice(saved);
      setMessage('Draft prices saved');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save prices');
    } finally {
      setSavingDraft(false);
    }
  }

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof ApiError ? err.message : 'Invoice not found');
    });
  }, [id]);

  if (!invoice) return <p className="text-sm text-muted-foreground">{error ?? 'Loading invoice…'}</p>;
  const editableDraft = invoice.status === 'DRAFT' && invoice.items.every((item) => item.serviceId);
  const pricesChanged = invoice.items.some((item, index) => item.unitPrice !== draftPrices[index]?.trim());

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card className="shadow-none">
        <CardHeader>
          <h1 className="text-xl font-semibold">{invoice.invoiceNumber ?? 'Draft invoice'}</h1>
          <p className="text-sm text-muted-foreground">{invoice.patientName} · {invoice.patientNumber}</p>
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
              {invoice.items.map((item, index) => (
                <tr key={`${item.description}-${index}`} className="border-b">
                  <td className="py-2">{item.description}{item.quantity > 1 ? ` × ${item.quantity}` : ''}</td>
                  {editableDraft ? (
                    <td className="py-1 text-right">
                      <label className="sr-only" htmlFor={`price-${index}`}>Unit price for {item.description}</label>
                      <Input
                        id={`price-${index}`}
                        className="ml-auto h-8 w-32 text-right"
                        inputMode="decimal"
                        value={draftPrices[index] ?? ''}
                        onChange={(event) =>
                          setDraftPrices((prices) => prices.map((p, i) => (i === index ? event.target.value : p)))
                        }
                      />
                    </td>
                  ) : (
                    <td className="text-right">LKR {item.lineTotal}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {editableDraft ? (
            <p className="text-xs text-muted-foreground">
              Draft: set each line&apos;s unit price (LKR), save, then issue the invoice.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {editableDraft ? (
              <Button
                type="button"
                variant="secondary"
                disabled={savingDraft || !pricesChanged}
                onClick={() => void saveDraftPrices(invoice)}
              >
                {savingDraft ? 'Saving…' : 'Save prices'}
              </Button>
            ) : null}
            {invoice.status === 'DRAFT' ? (
              <Button
                type="button"
                disabled={pricesChanged}
                title={pricesChanged ? 'Save prices before issuing' : undefined}
                onClick={async () => {
                  setError(null);
                  try {
                    const issued = await api<Invoice>(`/clinic/invoices/${id}/issue`, { method: 'POST', json: {} });
                    showInvoice(issued);
                    setMessage(`Issued ${issued.invoiceNumber}`);
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'Could not issue invoice');
                  }
                }}
              >
                Issue invoice
              </Button>
            ) : null}
            <PrintDocumentButton
              path={`/clinic/invoices/${id}/print`}
              label="Print bill"
              title={`Invoice ${invoice.invoiceNumber ?? 'draft'}`}
              description="Preview this bill on this page, then print or save it as a PDF."
            />
          </div>
          {invoice.payments.map((payment) => (
            <div key={payment.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                {payment.receipt_number} · {payment.method} · LKR {payment.amount}
              </span>
              <PrintDocumentButton
                path={`/clinic/payments/${payment.id}/receipt`}
                label="Reprint receipt"
                title={`Receipt ${payment.receipt_number}`}
                description="Preview this receipt on this page, then print or save it as a PDF."
                size="sm"
              />
            </div>
          ))}
          {error ? <p className="text-destructive">{error}</p> : null}
          {message ? <p className="text-primary">{message}</p> : null}
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
                  showInvoice(paid);
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
