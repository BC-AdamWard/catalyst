'use client';

import { useEffect } from 'react';

import { useVisitorId } from '~/hooks/use-visitor-id';
import { trackHomePageView } from '~/lib/vertex-pixel/events';

/**
 * Client component to track home page views with Vertex AI pixel
 */
export function HomePageTracker() {
  const visitorId = useVisitorId();

  useEffect(() => {
    if (visitorId) {
      trackHomePageView(visitorId);
    }
  }, [visitorId]);

  return null;
}
