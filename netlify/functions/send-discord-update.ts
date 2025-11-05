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

    // Try to read from missing-discord-updates.txt first (emails that need Discord update)
    // If not found, try delivered-emails-list.txt as fallback
    const missingFile = path.join(process.cwd(), 'missing-discord-updates.txt');
    const listFile = path.join(process.cwd(), 'delivered-emails-list.txt');
    let emailsToUse = new Set<string>();
    let emailToName = new Map<string, string>();

    if (fs.existsSync(missingFile)) {
      console.log('📄 Reading from missing-discord-updates.txt file (emails that need Discord update)...');
      const fileContent = fs.readFileSync(missingFile, 'utf-8');
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

      console.log(`📧 Loaded ${emailsToUse.size} missing emails from file`);
    } else if (fs.existsSync(listFile)) {
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
      progress: [] as Array<{ batch: number; sent: number; failed: number; total: number; timestamp: string }>,
    };

    // Process in batches of 20 with 1 minute delay between batches
    const BATCH_SIZE = 20;
    const BATCH_DELAY = 60000; // 1 minute in milliseconds
    const totalBatches = Math.ceil(emails.length / BATCH_SIZE);

    console.log(`📧 Starting to send ${emails.length} emails in ${totalBatches} batches of ${BATCH_SIZE}`);
    console.log(`⏱️  Delay between batches: ${BATCH_DELAY / 1000} seconds (${BATCH_DELAY / 60000} minute)`);
    console.log(`⏰ Estimated time: ~${Math.ceil(totalBatches * BATCH_DELAY / 60000)} minutes\n`);

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const batch = emails.slice(i, i + BATCH_SIZE);
      const batchStartTime = Date.now();
      
      console.log(`📦 Batch ${batchNumber}/${totalBatches}: Processing ${batch.length} emails...`);
      
      // Send emails in parallel within batch
      const batchResults = await Promise.allSettled(
        batch.map(async (email) => {
          try {
            const name = emailToName.get(email) || email;
            await sendDiscordLinkUpdate({
              to: email,
              name,
            });
            return { success: true, email };
          } catch (err: any) {
            return { success: false, email, error: err.message || 'Unknown error' };
          }
        })
      );

      // Process batch results
      let batchSent = 0;
      let batchFailed = 0;
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            results.sent++;
            batchSent++;
          } else {
            results.failed++;
            batchFailed++;
            results.errors.push({
              email: result.value.email,
              error: result.value.error || 'Unknown error',
            });
          }
        } else {
          results.failed++;
          batchFailed++;
          results.errors.push({
            email: 'unknown',
            error: result.reason?.message || 'Unknown error',
          });
        }
      });

      const batchDuration = Date.now() - batchStartTime;
      const progress = {
        batch: batchNumber,
        sent: batchSent,
        failed: batchFailed,
        total: batch.length,
        timestamp: new Date().toISOString(),
      };
      results.progress.push(progress);

      console.log(`   ✅ Batch ${batchNumber} complete: ${batchSent} sent, ${batchFailed} failed (${Math.round(batchDuration / 1000)}s)`);
      console.log(`   📊 Overall progress: ${results.sent}/${emails.length} sent (${Math.round((results.sent / emails.length) * 100)}%)`);

      // Wait 1 minute before next batch (except for the last batch)
      if (i + BATCH_SIZE < emails.length) {
        console.log(`   ⏳ Waiting ${BATCH_DELAY / 1000} seconds before next batch...\n`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      } else {
        console.log('');
      }
    }

    const sendingDuration = Date.now() - startTime;
    const durationMinutes = Math.round(sendingDuration / 60000);
    const durationSeconds = Math.round((sendingDuration % 60000) / 1000);
    console.log(`\n✅ Completed sending emails!`);
    console.log(`   📧 Total sent: ${results.sent}/${emails.length}`);
    console.log(`   ❌ Total failed: ${results.failed}`);
    console.log(`   ⏱️  Duration: ${durationMinutes}m ${durationSeconds}s`);
    console.log(`   📊 Success rate: ${Math.round((results.sent / emails.length) * 100)}%\n`);

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

