import { Navigate } from 'react-router-dom';

/** Legacy /billing/invoices/new → open create dialog on invoices list. */
export function InvoiceFormPage() {
  return <Navigate to="/billing/invoices?create=1" replace />;
}
