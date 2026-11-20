import { Navigate, useParams, useSearchParams } from 'react-router-dom';

/**
 * Route /sessions/:id redirects to the sessions list with ?detail=:id
 * so that session details open in a modal Dialog instead of a dedicated page.
 */
export function SessionDetailPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const isEdit = search.get('edit') === '1';

  if (!id) return <Navigate to="/sessions" replace />;

  const params = new URLSearchParams();
  params.set('detail', id);
  if (isEdit) params.set('edit', '1');

  return <Navigate to={`/sessions?${params.toString()}`} replace />;
}
