import { send, readJson, clientIp, verifyTurnstile } from './_lib/http.js';
import { getAdmin } from './_lib/supabaseAdmin.js';
import { deliverPass } from './_lib/mailer.js';
import { normalizeRegistration, validateRegistration } from '../src/lib/validation.js';

const KNOWN_DB_ERRORS = ['REGISTRATION_CLOSED', 'CAPACITY_REACHED', 'EVENT_ENDED'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return send(res, err.status || 400, { error: 'BAD_REQUEST' });
  }

  const input = normalizeRegistration(body);
  const fieldErrors = validateRegistration(input);
  if (fieldErrors) return send(res, 400, { error: 'VALIDATION', fields: fieldErrors });

  if (!(await verifyTurnstile(body.turnstileToken, clientIp(req)))) {
    return send(res, 400, { error: 'CAPTCHA_FAILED' });
  }

  let db;
  try {
    db = getAdmin();
  } catch (err) {
    console.error('[register]', err.message);
    return send(res, 500, { error: 'SERVER_MISCONFIGURED' });
  }

  const { data: reg, error } = await db.rpc('register', {
    p_name: input.name,
    p_email: input.email,
    p_reg_no: input.reg_no,
  });

  if (error) {
    const known = KNOWN_DB_ERRORS.find((code) => error.message?.includes(code));
    if (known) return send(res, 409, { error: known });
    if (error.code === '23505') return send(res, 409, { error: 'ALREADY_REGISTERED' });
    if (error.code === '23514') return send(res, 400, { error: 'VALIDATION' });
    console.error('[register] db error', error);
    return send(res, 500, { error: 'SERVER_ERROR' });
  }

  const emailSent = await deliverPass(db, reg);
  // The pass itself is only delivered by email, which proves the student owns the inbox.
  return send(res, 200, { ok: true, emailSent, email: reg.email });
}
