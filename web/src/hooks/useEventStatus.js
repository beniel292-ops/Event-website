import { useCallback, useEffect, useState } from 'react';
import { getEventStatus } from '../lib/api';

const POLL_MS = 20000;

// Keeps seats-left / open-closed status fresh while the page is open.
export function useEventStatus() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getEventStatus());
      setError(null);
    } catch (err) {
      console.error('Failed to load event status:', err);
      setError(err);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_MS);
    const onVisible = () => !document.hidden && refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return { status, error, refresh, loading: !status && !error };
}
