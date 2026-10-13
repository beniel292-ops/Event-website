import { supabase } from './supabase';

export async function getEventStatus() {
  const { data, error } = await supabase.rpc('get_event_status').single();
  if (error) throw error;
  return data;
}

async function postJson(url, body) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: 'NETWORK' };
  }
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await response.json().catch(() => ({})) : {};
  if (!response.ok) return { ok: false, error: data.error || `HTTP_${response.status}`, fields: data.fields };
  return { ok: true, ...data };
}

export const registerAttendee = (payload) => postJson('/api/register', payload);
export const resendPass = (payload) => postJson('/api/resend-pass', payload);
