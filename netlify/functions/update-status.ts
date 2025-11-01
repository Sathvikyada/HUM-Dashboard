import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';
import { requireAdmin } from './_utils/auth';
import { generateQrToken, generateQrBuffer } from './_utils/qr';
import { sendDecisionEmail } from './_utils/email';

type Decision = 'accepted' | 'waitlisted' | 'denied';

export const handler: Handler = async (event) => {
  try {
    requireAdmin(event);
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body || '{}');
    const { applicantId, decision, note, organizerName } = body as {
      applicantId: string;
      decision: Decision;
      note?: string;
      organizerName?: string;
    };

    if (!applicantId || !decision)
      return { statusCode: 400, body: 'Missing applicantId or decision' };

    // Fetch applicant
    const { data: app, error: gErr } = await supabaseAdmin
      .from('applicants')
      .select('*')
      .eq('id', applicantId)
      .single();

    if (gErr || !app)
      return { statusCode: 404, body: 'Applicant not found' };

    // Prevent race condition: check if already decided
    if (app.status !== 'pending' && app.status !== decision) {
      return { 
        statusCode: 409, 
        body: JSON.stringify({ 
          ok: false, 
          message: `Applicant already ${app.status}. Cannot change to ${decision}` 
        })
      };
    }

    let qrToken: string | null = app.qr_token;
    let qrBuffer: Buffer | undefined;

    // Only generate QR for accepted applicants
    if (decision === 'accepted') {
      // Regenerate if missing OR previously not accepted
      if (!qrToken || app.status !== 'accepted') {
        qrToken = generateQrToken();
      }
      const payload = JSON.stringify({ t: qrToken, e: process.env.EVENT_SLUG });
      console.log('🔹 Generating QR for payload:', payload);

      try {
        qrBuffer = await generateQrBuffer(payload);
        console.log('✅ QR buffer generated:', qrBuffer.length, 'bytes');
      } catch (qrErr) {
        console.error('❌ QR generation error:', qrErr);
        throw qrErr;
      }
    }

    // Update applicant record
    const { error: uErr } = await supabaseAdmin
      .from('applicants')
      .update({
        status: decision,
        decision_note: note || null,
        decided_by: organizerName || null,
        qr_token: decision === 'accepted' ? qrToken : app.qr_token,
      })
      .eq('id', applicantId);

    if (uErr) throw uErr;

    // Send email
    console.log(
      `📤 Sending ${decision} email to ${app.email} (has QR: ${!!qrBuffer})`
    );
    await sendDecisionEmail({
      to: app.email,
      name: app.full_name || app.email,
      decision,
      qrBuffer,
    });

    console.log('✅ Email sent successfully');
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err: any) {
    console.error('❌ updateStatus error:', err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || 'Server error' }),
    };
  }
};
