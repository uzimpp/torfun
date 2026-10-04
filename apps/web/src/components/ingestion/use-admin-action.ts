'use client';

import { useCallback, useState } from 'react';
import { SessionEndedError } from '@/lib/api';
import { messageFor } from '@/lib/api-errors';

export interface AdminAction {
  pending: boolean;
  error: string | null;
  /** The session cannot be renewed: sign in again rather than retry. */
  sessionEnded: boolean;
  /** Resolves true when the request succeeded, so the caller can close and reload. */
  run: (request: () => Promise<void>, fallback: string) => Promise<boolean>;
}

/**
 * The state around one administrator request behind a confirmation dialog:
 * in flight, refused, or refused because the session ended. Errors are worded
 * as the ingestion console words them, so the two read alike.
 */
export function useAdminAction(): AdminAction {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);

  const run = useCallback(async (request: () => Promise<void>, fallback: string) => {
    setPending(true);
    setError(null);
    setSessionEnded(false);
    try {
      await request();
      return true;
    } catch (caught) {
      setSessionEnded(caught instanceof SessionEndedError);
      setError(messageFor(caught, fallback));
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  return { pending, error, sessionEnded, run };
}
