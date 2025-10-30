import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';
import { requireAdmin } from './_utils/auth';
import { generateQrDataUrl, generateQrToken } from './_utils/qr';
import { sendDecisionEmail } from './_utils/email';

type Decision = 'accepted' | 'waitlisted' | 'denied';

export const handler: Handler = async (event) => {
  try {
    requireAdmin(event);
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const body = JSON.parse(event.body || '{}');
    const { applicantId, decision, note } = body as { applicantId: string; decision: Decision; note?: string };
    if (!applicantId || !decision) return { statusCode: 400, body: 'Missing applicantId or decision' };

    // Fetch applicant
    const { data: app, error: gErr } = await supabaseAdmin.from('applicants').select('*').eq('id', applicantId).single();
    if (gErr || !app) return { statusCode: 404, body: 'Applicant not found' };

    let qrToken: string | null = app.qr_token;
    let qrDataUrl: string | undefined;
    if (decision === 'accepted') {
      if (!qrToken) qrToken = generateQrToken();
      const payload = JSON.stringify({ t: qrToken, e: process.env.EVENT_SLUG });
      qrDataUrl = await generateQrDataUrl(payload);
    }

    // Update status
    const { error: uErr } = await supabaseAdmin
      .from('applicants')
      .update({ status: decision, decision_note: note || null, qr_token: decision === 'accepted' ? qrToken : app.qr_token })
      .eq('id', applicantId);
    if (uErr) throw uErr;

    // Send email
    await sendDecisionEmail({ to: app.email, name: app.full_name || app.email, decision, qrImageDataUrl: qrDataUrl });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err: any) {
    console.error(err);
    return { statusCode: err.statusCode || 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};

