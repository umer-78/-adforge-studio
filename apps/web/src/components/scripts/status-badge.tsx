import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import type { ScriptView } from '@/lib/types';

export function StatusBadge({ status }: { status: ScriptView['status'] }) {
  switch (status) {
    case 'generating':
      return (
        <Badge variant="secondary">
          <Spinner className="size-3" /> Writing
        </Badge>
      );
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'final':
      return <Badge variant="success">Approved</Badge>;
    default:
      return <Badge variant="outline">Draft</Badge>;
  }
}
