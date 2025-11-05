import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';
import { requireAdmin } from './_utils/auth';
import { generateQrToken, generateQrBuffer } from './_utils/qr';
import { sendTravelStipendEmail } from './_utils/email';

export const handler: Handler = async (event) => {
  try {
    requireAdmin(event);
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body || '{}');
    const { email } = body as {
      email: string;
    };

    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing email' }),
      };
    }

    // Fetch applicant from database
    const { data: applicant, error: fetchError } = await supabaseAdmin
      .from('applicants')
      .select('id, email, full_name, qr_token, status, responses')
      .eq('email', email.toLowerCase())
      .single();

    if (fetchError || !applicant) {
      return {
        statusCode: 404,
        body: JSON.stringify({ 
          error: `Applicant not found in database: ${email}`,
          hint: 'Please make sure the applicant exists in the database first'
        }),
      };
    }

    // Get travel stipend amount from responses
    const responses = applicant.responses || {};
    const stipendAmount = responses.stipend_amount;
    
    if (!stipendAmount) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: `Applicant ${email} does not have travel stipend data in responses`,
          hint: 'Please run sync-travel-stipend script first to add travel stipend data'
        }),
      };
    }

    // Generate QR token if missing
    let qrToken = applicant.qr_token;
    if (!qrToken) {
      qrToken = generateQrToken();
      // Update applicant with QR token
      await supabaseAdmin
        .from('applicants')
        .update({ qr_token: qrToken })
        .eq('id', applicant.id);
    }

    // Generate QR code buffer
    const payload = JSON.stringify({ t: qrToken, e: process.env.EVENT_SLUG || 'hackumass' });
    const qrBuffer = await generateQrBuffer(payload);

    // Send test email with actual applicant data
    await sendTravelStipendEmail({
      to: applicant.email,
      name: applicant.full_name || applicant.email,
      stipendAmount: stipendAmount,
      qrBuffer,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: `Test travel stipend email sent to ${applicant.email}`,
        applicant: {
          email: applicant.email,
          name: applicant.full_name,
          stipendAmount: stipendAmount,
        },
      }),
    };
  } catch (err: any) {
    console.error('❌ Test travel stipend email error:', err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || 'Server error' }),
    };
  }
};

