import { Navigate, useSearchParams } from 'react-router-dom';

/** Legacy /sessions/new route → open create dialog on the sessions list. */
export function SessionFormPage() {
  const [search] = useSearchParams();
  const params = new URLSearchParams();
  params.set('create', '1');
  const doctorId = search.get('doctorId');
  const date = search.get('date');
  if (doctorId) params.set('doctorId', doctorId);
  if (date) params.set('date', date);
  return <Navigate to={`/sessions?${params.toString()}`} replace />;
}
