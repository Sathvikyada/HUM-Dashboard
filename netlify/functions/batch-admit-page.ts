import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';
import { requireAdmin } from './_utils/auth';
import { generateQrToken, generateQrBuffer } from './_utils/qr';
import { sendDecisionEmail } from './_utils/email';

// Emails to exclude from auto-admission
const EXCLUDED_EMAILS = new Set([
  'ab620589@wne.edu',
  'abigail.f.mcclintock@proton.me',
  'ad605543@wne.edu',
  'adityamanojkrishna2005@gmail.com',
  'aec6237@psu.edu',
  'afrenk.biz@gmail.com',
  'alexander.mcgreevy@icloud.com',
  'ali.azam@rutgers.edu',
  'anastasiatumanov@gmail.com',
  'ardidauti6@gmail.com',
  'as631863@wne.edu',
  'basantana@wpi.edu',
  'brianmaki1234@gmail.com',
  'c1dicarlo@student.bridgew.edu',
  'cabalona.e@northeastern.edu',
  'cpimentelortiz80@gmail.com',
  'dl645932@wne.edu',
  'dsch28@bu.edu',
  'dupontlucian@gmail.com',
  'eduvert@wesleyan.edu',
  'egerjosiah@gmail.com',
  'ew457@cornell.edu',
  'farhan1@mit.edu',
  'gangina.v@northeastern.edu',
  'gltan9265@gmail.com',
  'hdawy@bu.edu',
  'hoangbach_nguyen@student.uml.edu',
  'hoangky271106@gmail.com',
  'ianpang126@gmail.com',
  'igifford01752@gmail.com',
  'ishitash4@gmail.com',
  'jb605077@wne.edu',
  'jc2886@cornell.edu',
  'jdawgg911@gmail.com',
  'kboscombe@student.bridgew.edu',
  'kelbychau11204@gmail.com',
  'kompella.sa@northeastern.edu',
  'krish2008.parmar@gmail.com',
  'kswenson@bu.edu',
  'kykyleb40@gmail.com',
  'kyle.chiem@outlook.com',
  'lbl5561@psu.edu',
  'lia.erisson15@gmail.com',
  'liu.denn@northeastern.edu',
  'madhavlodha2503@gmail.com',
  'mb604003@wne.edu',
  'mcgreevy.a@northeastern.edu',
  'mchohda1@terpmail.umd.edu',
  'minhd5@bu.edu',
  'nahian@mit.edu',
  'nd10s@terpmail.umd.edu',
  'ndisha@mit.edu',
  'nguyenle@bu.edu',
  'nicholas.m.chong@gmail.com',
  'nikitul2005@gmail.com',
  'nxhoang@bu.edu',
  'pps5577@psu.edu',
  'pranshushah2024@gmail.com',
  'prettyvoke05@gmail.com',
  'riwaz@bu.edu',
  'rl632822@wne.edu',
  'saikiransanju22@gmail.com',
  'sashakakkassery@gmail.com',
  'sean.deegan@snhu.edu',
  'shen.ra@northeastern.edu',
  'siddsingh@cs.stonybrook.edu',
  'simpsonn978@gmail.com',
  'smb8629@psu.edu',
  'ssghai@umd.edu',
  'ssriram1013@gmail.com',
  'tasbiauddin@gmail.com',
  'tdn26903@bu.edu',
  'terrell_osborne@uri.edu',
  'victorlong7865@gmail.com',
  'virmania@purdue.edu',
  'zayeedbinkabir@gmail.com',
  'yangryan133@gmail.com',
].map(e => e.toLowerCase()));

export const handler: Handler = async (event) => {
  try {
    requireAdmin(event);
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body || '{}');
    const { applicantIds, organizerName } = body as {
      applicantIds: string[];
      organizerName?: string;
    };

    if (!applicantIds || !Array.isArray(applicantIds)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid applicantIds array' }) };
    }

    if (applicantIds.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No applicant IDs provided' }) };
    }

    // Fetch all applicants
    const { data: applicants, error: fetchError } = await supabaseAdmin
      .from('applicants')
      .select('id, email, full_name, status, qr_token')
      .in('id', applicantIds);

    if (fetchError || !applicants) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to fetch applicants' }) };
    }

    // Filter: only pending applicants who are not in excluded emails
    const toAdmit = applicants.filter(app => {
      const emailLower = app.email.toLowerCase();
      return app.status === 'pending' && !EXCLUDED_EMAILS.has(emailLower);
    });

    const results = {
      total: applicantIds.length,
      eligible: toAdmit.length,
      skipped: applicants.length - toAdmit.length,
      admitted: 0,
      failed: 0,
      errors: [] as Array<{ email: string; error: string }>,
    };

    // Process each eligible applicant
    for (const applicant of toAdmit) {
      try {
        // Generate QR token - regenerate if missing or if status is not accepted
        // (We're processing pending applicants, so we should always generate a new token)
        let qrToken = applicant.qr_token;
        if (!qrToken || applicant.status !== 'accepted') {
          qrToken = generateQrToken();
        }

        // Generate QR code buffer
        const payload = JSON.stringify({ t: qrToken, e: process.env.EVENT_SLUG || 'hackumass' });
        const qrBuffer = await generateQrBuffer(payload);

        // Update database
        const { error: updateError } = await supabaseAdmin
          .from('applicants')
          .update({
            status: 'accepted',
            qr_token: qrToken,
            decided_by: organizerName || 'batch-admit-page',
          })
          .eq('id', applicant.id);

        if (updateError) {
          throw new Error(`Database update failed: ${updateError.message}`);
        }

        // Send email
        await sendDecisionEmail({
          to: applicant.email,
          name: applicant.full_name || applicant.email,
          decision: 'accepted',
          qrBuffer,
        });

        results.admitted++;
      } catch (err: any) {
        results.failed++;
        results.errors.push({
          email: applicant.email,
          error: err.message || 'Unknown error',
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        ...results,
      }),
    };
  } catch (err: any) {
    console.error('❌ Batch admit error:', err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || 'Server error' }),
    };
  }
};
