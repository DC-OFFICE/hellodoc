import { Navigate, useParams } from 'react-router-dom';

/**
 * Legacy full-page doctor form routes redirect into the doctors list dialog.
 * /doctors/new → ?create=1
 * /doctors/:id/edit → ?edit=:id
 */
export function DoctorFormPage() {
  const { id } = useParams();
  if (id) return <Navigate to={`/doctors?edit=${encodeURIComponent(id)}`} replace />;
  return <Navigate to="/doctors?create=1" replace />;
}
