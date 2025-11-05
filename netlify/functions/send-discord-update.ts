import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';
import { requireAdmin } from './_utils/auth';
import { sendDiscordLinkUpdate } from './_utils/email';

export const handler: Handler = async (event) => {
  try {
    requireAdmin(event);
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Get all unique delivered emails from acceptance emails only
    const { data: deliveredLogs, error: logsError } = await supabaseAdmin
      .from('email_logs')
      .select('applicant_email')
      .eq('event_type', 'delivered')
      .eq('subject', 'You are accepted to HackUMass! 🎉')
      .order('created_at', { ascending: false });

    if (logsError) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch delivered emails' }),
      };
    }

    // Get unique delivered emails from acceptance emails
    const deliveredEmails = new Set(
      (deliveredLogs || []).map(log => log.applicant_email.toLowerCase())
    );

    if (deliveredEmails.size === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No delivered acceptance emails found' }),
      };
    }

    // Get applicant details for these emails
    const { data: applicants, error: applicantsError } = await supabaseAdmin
      .from('applicants')
      .select('email, full_name')
      .in('email', Array.from(deliveredEmails));

    if (applicantsError) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch applicant details' }),
      };
    }

    // Create a map of email to full_name
    const emailToName = new Map<string, string>();
    (applicants || []).forEach(app => {
      emailToName.set(app.email.toLowerCase(), app.full_name || app.email);
    });

    // Send emails in batches
    const emails = Array.from(deliveredEmails);
    const startTime = Date.now();
    const results = {
      total: emails.length,
      sent: 0,
      failed: 0,
      errors: [] as Array<{ email: string; error: string }>,
    };

    // Process in batches of 10 to avoid rate limits
    const BATCH_SIZE = 10;
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      
      // Send emails in parallel within batch
      await Promise.all(
        batch.map(async (email) => {
          try {
            const name = emailToName.get(email) || email;
            await sendDiscordLinkUpdate({
              to: email,
              name,
            });
            results.sent++;
          } catch (err: any) {
            results.failed++;
            results.errors.push({
              email,
              error: err.message || 'Unknown error',
            });
          }
        })
      );

      // Small delay between batches to avoid rate limits
      if (i + BATCH_SIZE < emails.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const sendingDuration = Date.now() - startTime;
    console.log(`📧 Sent ${results.sent} emails in ${Math.round(sendingDuration / 1000)} seconds`);

    // Verify delivery by checking email_logs after a short delay
    // Wait a bit longer for webhook events to arrive (10 seconds minimum, or 5 seconds after sending completes)
    const waitTime = Math.max(10000, 5000); // At least 10 seconds
    await new Promise(resolve => setTimeout(resolve, waitTime));

    // Get delivered emails for Discord update
    // Check emails sent since the function started (with a 5 minute buffer to be safe)
    const verifyStartTime = new Date(startTime - 60000).toISOString(); // 1 minute before start (buffer for SendGrid processing)
    const { data: discordDeliveredLogs, error: verifyError } = await supabaseAdmin
      .from('email_logs')
      .select('applicant_email, created_at')
      .eq('event_type', 'delivered')
      .eq('subject', 'HackUMass XIII - Updated Discord Link')
      .gte('created_at', verifyStartTime); // Since function started (with buffer)

    const discordDeliveredSet = new Set(
      (discordDeliveredLogs || []).map(log => log.applicant_email.toLowerCase())
    );

    // Find emails that received acceptance email but not Discord update email
    const missingDeliveries = emails.filter(email => {
      const emailLower = email.toLowerCase();
      return !discordDeliveredSet.has(emailLower);
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        ...results,
        originalDeliveredCount: emails.length,
        discordDeliveredCount: discordDeliveredSet.size,
        verifiedDelivered: discordDeliveredSet.size,
        missingDeliveries: missingDeliveries.length,
        missingEmails: missingDeliveries,
        coverage: emails.length > 0 
          ? Math.round((discordDeliveredSet.size / emails.length) * 100)
          : 0,
      }),
    };
  } catch (err: any) {
    console.error('❌ Send Discord update error:', err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || 'Server error' }),
    };
  }
};

