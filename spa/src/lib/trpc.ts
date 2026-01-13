import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@openpath/api';

import { getAuthHeaders } from './headers';

function getApiUrl(): string {
  const stored = localStorage.getItem('requests_api_url');
  return stored || window.location.origin;
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${getApiUrl()}/trpc`,
      headers: getAuthHeaders,
    }),
  ],
});
