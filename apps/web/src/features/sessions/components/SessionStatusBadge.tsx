import { Badge } from '@/components/ui/badge';
import { sessionStatusLabel, sessionStatusTone } from '../utils/session-status';

export function SessionStatusBadge({ status }: { status: string }) {
  return <Badge tone={sessionStatusTone(status)}>{sessionStatusLabel(status)}</Badge>;
}
