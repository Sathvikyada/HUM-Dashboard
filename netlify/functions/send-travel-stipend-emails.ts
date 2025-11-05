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
    const { organizerName } = body as {
      organizerName?: string;
    };

    // Fetch all applicants and filter for those with travel stipend data
    console.log('📂 Fetching applicants with travel stipend data...');
    const { data: allApplicants, error: fetchError } = await supabaseAdmin
      .from('applicants')
      .select('id, email, full_name, qr_token, status, responses');

    if (fetchError) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch applicants' }),
      };
    }

    // Filter to only applicants with travel stipend data
    const applicants = (allApplicants || []).filter(app => {
      const responses = app.responses || {};
      return responses.stipend_amount !== undefined && responses.stipend_amount !== null;
    });

    if (applicants.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No applicants with travel stipend data found. Please run sync-travel-stipend script first.' }),
      };
    }

    console.log(`📊 Found ${applicants.length} applicants with travel stipend data`);

    const results = {
      total: applicants.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      errors: [] as Array<{ email: string; error: string }>,
      sentEmails: [] as string[],
      sentDetails: [] as Array<{ email: string; name: string; stipendAmount: string }>,
    };

    // Process each applicant
    for (const applicant of applicants) {
      try {
        const responses = applicant.responses || {};
        const stipendAmount = responses.stipend_amount || '0';

        // Skip if already accepted (to avoid duplicate emails)
        if (applicant.status === 'accepted' && applicant.qr_token) {
          results.skipped++;
          continue;
        }

        // Generate QR token if missing
        let qrToken = applicant.qr_token;
        if (!qrToken) {
          qrToken = generateQrToken();
        }

        // Generate QR code buffer
        const payload = JSON.stringify({ t: qrToken, e: process.env.EVENT_SLUG || 'hackumass' });
        const qrBuffer = await generateQrBuffer(payload);

        // Update database: mark as accepted, set QR token, and update decided_by
        const { error: updateError } = await supabaseAdmin
          .from('applicants')
          .update({
            status: 'accepted',
            qr_token: qrToken,
            decided_by: organizerName || 'travel-stipend-email',
          })
          .eq('id', applicant.id);

        if (updateError) {
          throw new Error(`Database update failed: ${updateError.message}`);
        }

        // Send email
        await sendTravelStipendEmail({
          to: applicant.email,
          name: applicant.full_name || applicant.email,
          stipendAmount: stipendAmount,
          qrBuffer,
        });

        results.sent++;
        results.sentEmails.push(applicant.email);
        results.sentDetails.push({
          email: applicant.email,
          name: applicant.full_name || applicant.email,
          stipendAmount: stipendAmount,
        });
      } catch (err: any) {
        results.failed++;
        results.errors.push({
          email: applicant.email,
          error: err.message || 'Unknown error',
        });
      }
    }

    console.log(`✅ Sent ${results.sent} emails, ${results.failed} failed, ${results.skipped} skipped`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        ...results,
      }),
    };
  } catch (err: any) {
    console.error('❌ Send travel stipend emails error:', err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || 'Server error' }),
    };
  }
};

