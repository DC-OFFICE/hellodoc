import { Navigate, useParams } from 'react-router-dom';

/**
 * Route /patients/new and /patients/:id/edit redirect into the patients list dialog.
 * /patients/new → ?create=1
 * /patients/:id/edit → ?edit=:id
 */
export function PatientFormPage() {
  const { id } = useParams();
  if (id) return <Navigate to={`/patients?edit=${encodeURIComponent(id)}`} replace />;
  return <Navigate to="/patients?create=1" replace />;
}
