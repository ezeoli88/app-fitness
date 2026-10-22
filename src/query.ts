import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
  },
});

export async function refreshTraining(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['home'] }),
    queryClient.invalidateQueries({ queryKey: ['routines'] }),
    queryClient.invalidateQueries({ queryKey: ['active-routine'] }),
    queryClient.invalidateQueries({ queryKey: ['routine-history'] }),
    queryClient.invalidateQueries({ queryKey: ['routine-draft'] }),
    queryClient.invalidateQueries({ queryKey: ['history'] }),
  ]);
}
