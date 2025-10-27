/**
 * Hook to manage Vertex AI visitor ID in cookies
 * Reuses the existing visitor ID from BigCommerce analytics
 */

'use client';

import { useEffect, useState } from 'react';

import { getVisitorIdCookie } from '~/lib/analytics/bigcommerce';

export function useVisitorId(): string | null {
  const [visitorId, setVisitorId] = useState<string | null>(null);

  useEffect(() => {
    getVisitorIdCookie()
      .then((id) => {
        if (id) {
          setVisitorId(id);
        }
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error('[Vertex Pixel] Error getting visitor ID:', error);
      });
  }, []);

  return visitorId;
}
