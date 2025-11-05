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
    const functionStartTime = Date.now();
    const results = {
      total: emails.length,
      sent: 0,
      failed: 0,
      errors: [] as Array<{ email: string; error: string }>,
      progress: [] as Array<{ batch: number; sent: number; failed: number; total: number; timestamp: string; sentEmails?: string[] }>,
      timedOut: false,
      completedBatches: 0,
      remainingEmails: emails.length,
    };

    // Process in batches of 20 with 5 second delay between batches
    // Reduced delay to avoid Netlify function timeout (26s limit)
    // Function will send as many batches as possible within timeout, then return partial results
    const BATCH_SIZE = 20;
    const BATCH_DELAY = 5000; // 5 seconds in milliseconds
    const totalBatches = Math.ceil(emails.length / BATCH_SIZE);
    const FUNCTION_TIMEOUT = 20000; // 20 seconds - leave buffer for response

    console.log(`📧 Starting to send ${emails.length} emails in ${totalBatches} batches of ${BATCH_SIZE}`);
    console.log(`⏱️  Delay between batches: ${BATCH_DELAY / 1000} seconds`);
    console.log(`⏰ Function timeout: ~${FUNCTION_TIMEOUT / 1000} seconds. Will return partial results if timeout occurs.\n`);

    let completedBatches = 0;
    let timedOut = false;

    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      // Check if we're approaching timeout
      const elapsed = Date.now() - functionStartTime;
      if (elapsed > FUNCTION_TIMEOUT) {
        console.log(`\n⏰ Approaching timeout (${Math.round(elapsed / 1000)}s elapsed). Stopping to return partial results.`);
        timedOut = true;
        results.timedOut = true;
        break;
      }

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
      const batchSentEmails: string[] = [];
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            results.sent++;
            batchSent++;
            batchSentEmails.push(result.value.email);
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
        sentEmails: batchSentEmails,
      };
      results.progress.push(progress);
      completedBatches = batchNumber;

      console.log(`   ✅ Batch ${batchNumber} complete: ${batchSent} sent, ${batchFailed} failed (${Math.round(batchDuration / 1000)}s)`);
      console.log(`   📊 Overall progress: ${results.sent}/${emails.length} sent (${Math.round((results.sent / emails.length) * 100)}%)`);
      console.log(`   ⏱️  Elapsed time: ${Math.round((Date.now() - functionStartTime) / 1000)}s`);

      // Wait before next batch (except for the last batch)
      if (i + BATCH_SIZE < emails.length) {
        const timeUntilTimeout = FUNCTION_TIMEOUT - (Date.now() - functionStartTime);
        if (timeUntilTimeout < BATCH_DELAY + 5000) {
          // Not enough time for another batch, return now
          console.log(`   ⏰ Not enough time for next batch. Returning partial results.\n`);
          timedOut = true;
          results.timedOut = true;
          break;
        }
        console.log(`   ⏳ Waiting ${BATCH_DELAY / 1000} seconds before next batch...\n`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      } else {
        console.log('');
      }
    }

    const sendingDuration = Date.now() - functionStartTime;
    const durationMinutes = Math.round(sendingDuration / 60000);
    const durationSeconds = Math.round((sendingDuration % 60000) / 1000);
    
    results.completedBatches = completedBatches;
    results.timedOut = timedOut;
    results.remainingEmails = emails.length - results.sent - results.failed;

    if (timedOut) {
      console.log(`\n⏰ Function timed out after ${Math.round(sendingDuration / 1000)}s`);
      console.log(`   📧 Sent in this run: ${results.sent}/${emails.length}`);
      console.log(`   ❌ Failed in this run: ${results.failed}`);
      console.log(`   📦 Completed batches: ${completedBatches}/${totalBatches}`);
      console.log(`   ⏳ Remaining emails: ${results.remainingEmails}`);
      console.log(`   💡 Click "Send Discord Update" again to continue with remaining emails.\n`);
    } else {
      console.log(`\n✅ Completed sending emails!`);
      console.log(`   📧 Total sent: ${results.sent}/${emails.length}`);
      console.log(`   ❌ Total failed: ${results.failed}`);
      console.log(`   ⏱️  Duration: ${durationMinutes}m ${durationSeconds}s`);
      console.log(`   📊 Success rate: ${Math.round((results.sent / emails.length) * 100)}%\n`);
    }

    // Verify delivery by checking email_logs after a short delay
    // Only verify if we didn't timeout (to save time)
    let verificationReport = null;
    
    if (!timedOut) {
      // Wait a bit longer for webhook events to arrive (10 seconds minimum)
      const waitTime = Math.max(10000, 5000); // At least 10 seconds
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Get delivered emails for Discord update
      // Check emails sent since the function started (with a 1 minute buffer to be safe)
      const verifyStartTime = new Date(functionStartTime - 60000).toISOString(); // 1 minute before start (buffer for SendGrid processing)
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
      verificationReport = {
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
    } else {
      console.log(`\n⏰ Skipping verification due to timeout. Will verify on next run.\n`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        ...results,
        verification: verificationReport,
        message: timedOut 
          ? `Function timed out. Sent ${results.sent} emails. Click "Send Discord Update" again to continue.`
          : `Successfully sent ${results.sent} Discord update emails.`,
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

