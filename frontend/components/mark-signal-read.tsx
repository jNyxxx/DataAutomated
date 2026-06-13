'use client';

import { useEffect } from 'react';

export default function MarkSignalRead({ signalId }: { signalId: string }) {
  useEffect(() => {
    void fetch(`/api/backend/signals/${signalId}/read`, { method: 'PATCH' });
  }, [signalId]);
  return null;
}
