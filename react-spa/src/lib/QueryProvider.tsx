import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function QueryProvider({ children }: Props) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minuto
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // Extend the default focus listener to also refetch on window focus.
  // React Query's default focus detection relies on visibilitychange only.
  useEffect(() => {
    focusManager.setEventListener((handleFocus) => {
      const onVisibilityChange = () => {
        handleFocus(document.visibilityState === 'visible');
      };

      const onFocus = () => {
        handleFocus(true);
      };

      window.addEventListener('visibilitychange', onVisibilityChange, false);
      window.addEventListener('focus', onFocus, false);
      return () => {
        window.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('focus', onFocus);
      };
    });
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
