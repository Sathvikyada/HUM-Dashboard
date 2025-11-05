import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';
import { requireAdmin } from './_utils/auth';
import { sendDiscordLinkUpdate } from './_utils/email';
import fs from 'fs';
import path from 'path';

export const handler: Handler = async (event) => {
  try {
    requireAdmin(event);
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Try to read from delivered-emails-list.txt file first
    const listFile = path.join(process.cwd(), 'delivered-emails-list.txt');
    let emailsToUse = new Set<string>();
    let emailToName = new Map<string, string>();

    if (fs.existsSync(listFile)) {
      console.log('📄 Reading from delivered-emails-list.txt file...');
      const fileContent = fs.readFileSync(listFile, 'utf-8');
      const lines = fileContent.split('\n').filter(line => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('#') && trimmed.includes('|');
      });

      lines.forEach(line => {
        const [email, name] = line.split('|').map(s => s.trim());
        if (email) {
          emailsToUse.add(email.toLowerCase());
          emailToName.set(email.toLowerCase(), name || email);
        }
      });

      console.log(`📧 Loaded ${emailsToUse.size} emails from file`);
    } else {
      console.log('📄 File not found, generating list from database...');
      
      // Get all accepted applicants first
      const { data: acceptedApplicants, error: acceptedError } = await supabaseAdmin
        .from('applicants')
        .select('email, full_name')
        .eq('status', 'accepted');

      if (acceptedError) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to fetch accepted applicants' }),
        };
      }

      if (!acceptedApplicants || acceptedApplicants.length === 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'No accepted applicants found' }),
        };
      }

      const acceptedEmails = new Set(
        acceptedApplicants.map(app => app.email.toLowerCase())
      );

      // Get all delivered emails and filter to only accepted applicants
      const { data: deliveredLogs, error: logsError } = await supabaseAdmin
        .from('email_logs')
        .select('applicant_email, subject')
        .eq('event_type', 'delivered')
        .order('created_at', { ascending: false });

      if (logsError) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to fetch delivered emails' }),
        };
      }

      // Filter to only accepted applicants who received emails
      const deliveredEmails = new Set<string>();
      const acceptanceEmails = new Set<string>();
      
      (deliveredLogs || []).forEach(log => {
        const emailLower = log.applicant_email.toLowerCase();
        if (acceptedEmails.has(emailLower)) {
          const subject = (log.subject || '').toLowerCase();
          if (subject.includes('accepted') || subject.includes('hackumass')) {
            acceptanceEmails.add(emailLower);
          }
          deliveredEmails.add(emailLower);
        }
      });

      // Use acceptance emails if found, otherwise use all delivered emails
      const emailsToUseSet = acceptanceEmails.size > 0 ? acceptanceEmails : deliveredEmails;

      console.log(`📧 Found ${deliveredLogs?.length || 0} total delivery logs`);
      console.log(`📧 Accepted applicants: ${acceptedApplicants.length}`);
      console.log(`📧 Accepted applicants with delivered emails: ${deliveredEmails.size}`);
      console.log(`📧 Accepted applicants with acceptance emails: ${acceptanceEmails.size}`);
      console.log(`📧 Using ${emailsToUseSet.size} emails`);

      emailsToUse = emailsToUseSet;

      // Create name map
      acceptedApplicants.forEach(app => {
        const emailLower = app.email.toLowerCase();
        if (emailsToUse.has(emailLower)) {
          emailToName.set(emailLower, app.full_name || app.email);
        }
      });
    }

    if (emailsToUse.size === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'No delivered emails found',
          hint: 'Run "npm run generate-delivered-emails" to generate the list first'
        }),
      };
    }

    // Send emails in batches
    const emails = Array.from(emailsToUse);
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
      .ilike('subject', '%HackUMass XIII - Updated Discord Link%')
      .gte('created_at', verifyStartTime); // Since function started (with buffer)

    const discordDeliveredSet = new Set(
      (discordDeliveredLogs || []).map(log => log.applicant_email.toLowerCase())
    );

    // Find emails that received acceptance email but not Discord update email
    const missingDeliveries = emails.filter(email => {
      const emailLower = email.toLowerCase();
      return !discordDeliveredSet.has(emailLower);
    });

    // Generate verification report
    const verificationReport = {
      originalListCount: emails.length,
      attemptedToSend: results.sent,
      failedToSend: results.failed,
      verifiedDelivered: discordDeliveredSet.size,
      missingDeliveries: missingDeliveries.length,
      coverage: emails.length > 0 
        ? Math.round((discordDeliveredSet.size / emails.length) * 100)
        : 0,
      missingEmails: missingDeliveries,
      allCovered: missingDeliveries.length === 0,
    };

    console.log(`\n📊 Verification Report:`);
    console.log(`   Original list: ${verificationReport.originalListCount} emails`);
    console.log(`   Attempted to send: ${verificationReport.attemptedToSend}`);
    console.log(`   Failed to send: ${verificationReport.failedToSend}`);
    console.log(`   Verified delivered: ${verificationReport.verifiedDelivered}`);
    console.log(`   Missing deliveries: ${verificationReport.missingDeliveries}`);
    console.log(`   Coverage: ${verificationReport.coverage}%`);
    console.log(`   All covered: ${verificationReport.allCovered ? '✅ Yes' : '❌ No'}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        ...results,
        verification: verificationReport,
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

