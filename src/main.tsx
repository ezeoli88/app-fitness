import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { RestTimerProvider } from '@/rest/RestTimer';
import { queryClient } from '@/query';
import { routeTree } from '@/routeTree.gen';
import { ThemeProvider } from '@/theme/ThemeProvider';
import '@/styles.css';

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById('root');
if (!root) throw new Error('No encontramos el contenedor de la aplicación.');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RestTimerProvider>
          <RouterProvider router={router} />
        </RestTimerProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
