import { Navigate, useSearchParams } from 'react-router-dom';

/** Legacy /appointments/new → open booking dialog on appointments list. */
export function AppointmentFormPage() {
  const [search] = useSearchParams();
  const params = new URLSearchParams();
  params.set('create', '1');
  for (const key of ['patientId', 'doctorId', 'sessionId'] as const) {
    const value = search.get(key);
    if (value) params.set(key, value);
  }
  return <Navigate to={`/appointments?${params.toString()}`} replace />;
}
