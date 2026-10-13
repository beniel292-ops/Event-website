import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { formatEventDate } from '../../src/lib/event.js';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let transporter;
function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASS;
  if (!user || !pass) throw new Error('GMAIL_USER / GMAIL_APP_PASS not configured');
  // SMTP_HOST/SMTP_PORT are optional overrides (e.g. a local Mailpit inbox for testing).
  transporter ??= process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user, pass },
      })
    : nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  return { transporter, user };
}

// Sends the entry pass for a registration row that came from the database.
// The recipient is ALWAYS the stored email — never an address from the request.
export async function sendPassEmail(reg, event) {
  const { transporter: tx, user } = getTransporter();
  const qrPng = await QRCode.toBuffer(reg.id, { width: 320, margin: 1, color: { dark: '#000000', light: '#ffffff' } });

  const title = event?.event_title || 'Event';
  const date = formatEventDate(event?.event_date);
  const venue = event?.venue || '';
  const name = escapeHtml(reg.name);
  const regNo = escapeHtml(reg.reg_no);

  const html = `
  <div style="font-family: Arial, sans-serif; background:#000; color:#fff; padding:28px; max-width:560px; margin:0 auto; border:1px solid #333; border-radius:12px;">
    <h2 style="margin:0; font-size:22px;">Zero Bugs Club</h2>
    <p style="color:#a3a3a3; margin:4px 0 20px; font-size:12px; text-transform:uppercase; letter-spacing:1px;">${escapeHtml(title)} · Entry Pass</p>
    <p style="font-size:16px; color:#e5e7eb;">Hi <strong>${name}</strong>,</p>
    <p style="font-size:14px; color:#d4d4d8; line-height:1.6;">Your registration is confirmed. Show this QR code at the venue door to check in.</p>
    <table role="presentation" style="width:100%; margin:16px 0; font-size:14px; color:#e5e7eb;">
      <tr><td style="color:#a3a3a3; padding:4px 0;">Reg No</td><td style="text-align:right;">${regNo}</td></tr>
      <tr><td style="color:#a3a3a3; padding:4px 0;">Date</td><td style="text-align:right;">${escapeHtml(date)}</td></tr>
      <tr><td style="color:#a3a3a3; padding:4px 0;">Venue</td><td style="text-align:right;">${escapeHtml(venue)}</td></tr>
    </table>
    <div style="background:#fff; padding:12px; border-radius:12px; text-align:center;">
      <img src="cid:entry_pass_qr" alt="Entry pass QR code" width="280" height="280" style="display:block; margin:0 auto;" />
    </div>
    <p style="font-size:12px; color:#a3a3a3; margin-top:16px;">This pass is personal — don't share it. Each QR can be checked in only once.</p>
    <p style="font-size:11px; color:#a3a3a3; text-align:center; margin-top:24px;">© ${new Date().getFullYear()} Zero Bugs Club — VIT Chennai</p>
  </div>`;

  const text = [
    `Hi ${reg.name},`,
    '',
    `Your registration for ${title} is confirmed.`,
    `Reg No: ${reg.reg_no}`,
    `Date: ${date}`,
    `Venue: ${venue}`,
    '',
    'Show the QR code in this email at the venue door to check in.',
    '— Zero Bugs Club, VIT Chennai',
  ].join('\n');

  return tx.sendMail({
    from: `"Zero Bugs Club" <${user}>`,
    to: reg.email,
    subject: `[ZBC Pass] ${title} Entry Pass - ${reg.reg_no}`,
    text,
    html,
    attachments: [{ filename: `ZBC-Pass-${reg.reg_no}.png`, content: qrPng, cid: 'entry_pass_qr', contentType: 'image/png' }],
  });
}

// Sends the pass and records email_sent_at. Returns true on success.
export async function deliverPass(db, reg) {
  try {
    const { data: event } = await db.rpc('get_event_status').single();
    await sendPassEmail(reg, event);
    await db.from('registrations').update({ email_sent_at: new Date().toISOString() }).eq('id', reg.id);
    return true;
  } catch (err) {
    console.error('[mail] pass delivery failed for', reg.reg_no, err?.message);
    return false;
  }
}
