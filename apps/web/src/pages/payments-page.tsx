import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api';

type Payment = {
  id: string;
  payment_reference: string;
  receipt_number: string;
  amount: string;
  method: string;
  patient_name: string;
  invoice_number: string | null;
};

export function PaymentsPage() {
  const [items, setItems] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ items: Payment[] }>('/clinic/payments')
      .then((data) => setItems(data.items))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Unable to load payments'));
  }, []);

  return (
    <Card className="shadow-none">
      <CardHeader><h1 className="text-xl font-semibold">Payments</h1></CardHeader>
      <CardContent>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-2">Receipt</th>
              <th>Invoice</th>
              <th>Patient</th>
              <th>Method</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b">
                <td className="py-2">{item.receipt_number}</td>
                <td>{item.invoice_number}</td>
                <td>{item.patient_name}</td>
                <td>{item.method}</td>
                <td>LKR {item.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
