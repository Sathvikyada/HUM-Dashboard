import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const body = JSON.parse(event.body || '{}');
    const { token } = body as { token: string };
    if (!token) return { statusCode: 400, body: 'Missing token' };

    // Mark checked in atomically
    const { data, error } = await supabaseAdmin
      .from('applicants')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('qr_token', token)
      .is('checked_in_at', null)
      .select('*')
      .single();

    if (error && error.code === 'PGRST116') {
      // not found or already checked in
      // Try fetch to check if already checked in
      const { data: existing } = await supabaseAdmin.from('applicants').select('checked_in_at').eq('qr_token', token).maybeSingle();
      if (!existing) return { statusCode: 404, body: JSON.stringify({ ok: false, reason: 'NOT_FOUND' }) };
      if (existing.checked_in_at) return { statusCode: 409, body: JSON.stringify({ ok: false, reason: 'ALREADY_CHECKED_IN' }) };
    }
    if (error) throw error;

    return { statusCode: 200, body: JSON.stringify({ ok: true, applicantId: data.id }) };
  } catch (err: any) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};

