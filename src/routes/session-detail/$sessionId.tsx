import { createFileRoute } from '@tanstack/react-router';

import { SessionDetailView } from '@/components/SessionDetailView';
import { usePageTitle } from '@/ui/pageTitle';

export const Route = createFileRoute('/session-detail/$sessionId')({
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const { sessionId } = Route.useParams();
  usePageTitle('Detalle');
  return (
    <main>
      <SessionDetailView sessionId={Number(sessionId)} />
    </main>
  );
}
