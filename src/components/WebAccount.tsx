import { useQuery } from '@tanstack/react-query';

import { apiBase } from '@/data/http';

type Me = { email: string; kind: string };

export function WebAccount() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const response = await fetch(`${apiBase()}/me`, { credentials: 'include', redirect: 'manual' });
      if (!response.ok) return null;
      return await response.json() as Me;
    },
  });
  if (!me.data?.email) return null;
  const local = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return (
    <div className="account">
      <p>{me.data.email}</p>
      {local ? null : <a href="/cdn-cgi/access/logout">Salir</a>}
    </div>
  );
}
