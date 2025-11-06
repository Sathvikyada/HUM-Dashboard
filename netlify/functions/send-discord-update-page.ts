import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';
import { requireAdmin } from './_utils/auth';
import { sendDiscordUpdateEmail } from './_utils/email';

export const handler: Handler = async (event) => {
  try {
    requireAdmin(event);
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body || '{}');
    const { emails } = body as {
      emails?: string[];
    };

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No emails provided' }),
      };
    }

    // Normalize emails
    const pageEmails = emails.map(e => e.toLowerCase());

    console.log(`📧 Processing ${pageEmails.length} emails from dashboard page`);

    // Fetch all delivered emails from email_logs (same logic as the script)
    // This builds the "allowed" list - emails that should receive Discord updates
    console.log('📂 Building allowed email list from delivered emails...');
    
    // Fetch all delivered emails
    let allDeliveredLogs: Array<{ applicant_email: string; event_type: string; created_at: string; subject: string | null }> = [];
    let offset = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: pageLogs, error: allLogsError } = await supabaseAdmin
        .from('email_logs')
        .select('applicant_email, event_type, created_at, subject')
        .eq('event_type', 'delivered')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (allLogsError) {
        console.error('❌ Error fetching email logs:', allLogsError);
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to fetch email logs' }),
        };
      }

      if (pageLogs && pageLogs.length > 0) {
        allDeliveredLogs = allDeliveredLogs.concat(pageLogs);
        offset += PAGE_SIZE;
        hasMore = pageLogs.length === PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    // Get unique emails from delivered logs
    const uniqueEmailsFromLogs = new Set<string>();
    allDeliveredLogs.forEach(log => {
      if (log.applicant_email) {
        uniqueEmailsFromLogs.add(log.applicant_email.toLowerCase());
      }
    });

    // Remove denied emails
    const deniedEmails = ['arnavpalawat@gmail.com', 'tyler@borisshoes.net'].map(e => e.toLowerCase());
    deniedEmails.forEach(email => {
      uniqueEmailsFromLogs.delete(email);
    });

    console.log(`📊 Allowed email list has ${uniqueEmailsFromLogs.size} unique emails`);

    // Filter page emails to only those in the allowed list
    const emailsToSend = pageEmails.filter(email => uniqueEmailsFromLogs.has(email));
    const skippedEmails = pageEmails.filter(email => !uniqueEmailsFromLogs.has(email));

    console.log(`✅ ${emailsToSend.length} emails on page are in allowed list, ${skippedEmails.length} skipped`);

    if (emailsToSend.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          totalOnPage: pageEmails.length,
          inList: 0,
          sent: 0,
          failed: 0,
          skipped: skippedEmails.length,
          errors: [],
          sentDetails: [],
          skippedDetails: skippedEmails,
        }),
      };
    }

    // Fetch applicant names from database
    const { data: applicants, error: fetchError } = await supabaseAdmin
      .from('applicants')
      .select('email, full_name')
      .in('email', emailsToSend);

    if (fetchError) {
      console.error('❌ Error fetching applicants:', fetchError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to fetch applicants' }),
      };
    }

    // Create email to name map
    const emailToName = new Map<string, string>();
    (applicants || []).forEach(app => {
      emailToName.set(app.email.toLowerCase(), app.full_name || app.email);
    });

    const results = {
      totalOnPage: pageEmails.length,
      inList: emailsToSend.length,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: skippedEmails.length,
      errors: [] as Array<{ email: string; error: string }>,
      sentDetails: [] as Array<{ email: string; name: string }>,
      skippedDetails: skippedEmails,
    };

    // Process each email that's in the allowed list
    for (const email of emailsToSend) {
      try {
        const name = emailToName.get(email) || email;

        // Send email
        await sendDiscordUpdateEmail({
          to: email,
          name,
        });

        results.sent++;
        results.sentDetails.push({ email, name });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err: any) {
        results.failed++;
        results.errors.push({
          email,
          error: err.message || 'Unknown error',
        });
        console.error(`❌ Error sending to ${email}:`, err.message);
      }
      results.processed++;
    }

    console.log(`✅ Complete: ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        ...results,
      }),
    };
  } catch (err: any) {
    console.error('❌ Send Discord update page error:', err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({ error: err.message || 'Server error' }),
    };
  }
};

