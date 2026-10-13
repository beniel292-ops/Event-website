import { send, readJson, clientIp, verifyTurnstile } from './_lib/http.js';
import { getAdmin } from './_lib/supabaseAdmin.js';
import { deliverPass } from './_lib/mailer.js';
import { validateVitEmail } from '../src/lib/validation.js';

const COOLDOWN_MS = 2 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return send(res, err.status || 400, { error: 'BAD_REQUEST' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (validateVitEmail(email)) return send(res, 400, { error: 'VALIDATION', fields: { email: validateVitEmail(email) } });

  if (!(await verifyTurnstile(body.turnstileToken, clientIp(req)))) {
    return send(res, 400, { error: 'CAPTCHA_FAILED' });
  }

  let db;
  try {
    db = getAdmin();
  } catch (err) {
    console.error('[resend-pass]', err.message);
    return send(res, 500, { error: 'SERVER_MISCONFIGURED' });
  }

  const { data: reg } = await db
    .from('registrations')
    .select('id, name, email, reg_no, email_sent_at')
    .eq('email', email)
    .maybeSingle();

  const cooledDown = !reg?.email_sent_at || Date.now() - new Date(reg.email_sent_at).getTime() > COOLDOWN_MS;
  if (reg && cooledDown) await deliverPass(db, reg);

  // Same answer whether or not the email exists, so this can't be used to look people up.
  return send(res, 200, { ok: true });
}
