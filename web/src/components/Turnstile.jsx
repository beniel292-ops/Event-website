import { useEffect, useRef } from 'react';
import { TURNSTILE_SITE_KEY as SITE_KEY } from '../lib/turnstile';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise;
function loadScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// Cloudflare Turnstile bot check. Renders nothing if VITE_TURNSTILE_SITE_KEY is not set.
// Change `resetKey` to get a fresh token after each submit.
export default function Turnstile({ onToken, resetKey }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!SITE_KEY) return undefined;
    let widgetId;
    let cancelled = false;
    onToken(null);
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          theme: 'dark',
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      })
      .catch(() => console.error('Failed to load Turnstile'));
    return () => {
      cancelled = true;
      if (widgetId !== undefined) window.turnstile?.remove(widgetId);
    };
  }, [onToken, resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={ref} className="flex justify-center min-h-[65px]" />;
}
