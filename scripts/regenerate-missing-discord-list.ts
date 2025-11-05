import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

async function regenerateMissingList() {
  try {
    console.log('🔍 Regenerating missing Discord update email list...\n');

    // Read the original delivered emails list
    const listFile = path.join(process.cwd(), 'delivered-emails-list.txt');
    if (!fs.existsSync(listFile)) {
      console.error('❌ delivered-emails-list.txt not found');
      console.log('   Run "npm run generate-delivered-emails" first');
      process.exit(1);
    }

    const fileContent = fs.readFileSync(listFile, 'utf-8');
    const lines = fileContent.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#') && trimmed.includes('|');
    });

    const originalEmails = new Set<string>();
    const emailToName = new Map<string, string>();

    lines.forEach(line => {
      const [email, name] = line.split('|').map(s => s.trim());
      if (email) {
        originalEmails.add(email.toLowerCase());
        emailToName.set(email.toLowerCase(), name || email);
      }
    });

    console.log(`📄 Read ${originalEmails.size} emails from delivered-emails-list.txt\n`);

    // Check for Discord update emails delivered after 11/5/2025, 1:56:30 AM
    // Convert to ISO string: 2025-11-05T01:56:30.000Z
    const timestamp = new Date('2025-11-05T01:56:30.000Z');
    console.log(`📅 Checking for Discord update emails delivered after: ${timestamp.toISOString()}\n`);

    // Get all delivered emails after that timestamp
    // We'll check both by subject and by timestamp (since subject might not be stored)
    const { data: deliveredLogs, error: logsError } = await supabase
      .from('email_logs')
      .select('applicant_email, subject, raw_event, created_at')
      .eq('event_type', 'delivered')
      .gte('created_at', timestamp.toISOString())
      .order('created_at', { ascending: false });

    if (logsError) {
      console.error('❌ Error fetching logs:', logsError.message);
      process.exit(1);
    }

    console.log(`📧 Found ${deliveredLogs?.length || 0} delivery events after timestamp\n`);

    // Find Discord update emails by:
    // 1. Subject line (if present)
    // 2. Raw event subject field
    // 3. All emails delivered after timestamp that are in original list (likely Discord updates)
    const discordDeliveredEmails = new Set<string>();
    const discordEmailsBySubject = new Set<string>();
    const allRecentEmails = new Set<string>();

    deliveredLogs?.forEach(log => {
      const emailLower = log.applicant_email.toLowerCase();
      allRecentEmails.add(emailLower);

      // Check subject field
      const subject = log.subject || '';
      if (subject.toLowerCase().includes('discord') || 
          subject.toLowerCase().includes('updated discord')) {
        discordDeliveredEmails.add(emailLower);
        discordEmailsBySubject.add(emailLower);
      }

      // Check raw_event JSONB for subject
      if (log.raw_event && typeof log.raw_event === 'object') {
        const rawSubject = (log.raw_event as any).subject || '';
        if (rawSubject.toLowerCase().includes('discord') || 
            rawSubject.toLowerCase().includes('updated discord')) {
          discordDeliveredEmails.add(emailLower);
          discordEmailsBySubject.add(emailLower);
        }
      }

      // If email is in original list and was delivered after timestamp, assume it's a Discord update
      if (originalEmails.has(emailLower)) {
        discordDeliveredEmails.add(emailLower);
      }
    });

    console.log(`📊 Analysis:`);
    console.log(`   Total recent deliveries: ${allRecentEmails.size}`);
    console.log(`   Discord emails found by subject: ${discordEmailsBySubject.size}`);
    console.log(`   Discord emails found (all methods): ${discordDeliveredEmails.size}`);
    console.log(`   Discord emails in original list: ${Array.from(discordDeliveredEmails).filter(e => originalEmails.has(e)).length}\n`);

    // Find missing emails (in original list but not delivered)
    const missingEmails = new Set<string>();
    originalEmails.forEach(email => {
      if (!discordDeliveredEmails.has(email)) {
        missingEmails.add(email);
      }
    });

    console.log('='.repeat(80));
    console.log('📊 REGENERATED MISSING LIST');
    console.log('='.repeat(80));
    console.log(`\n📋 Original list: ${originalEmails.size} emails`);
    console.log(`✅ Discord update delivered: ${discordDeliveredEmails.size} emails`);
    console.log(`❌ Missing deliveries: ${missingEmails.size} emails`);
    console.log(`📊 Coverage: ${Math.round((discordDeliveredEmails.size / originalEmails.size) * 100)}%\n`);

    // Generate missing emails list file
    const missingFile = path.join(process.cwd(), 'missing-discord-updates.txt');
    const missingLines: string[] = [];
    
    const sortedMissing = Array.from(missingEmails).sort();
    sortedMissing.forEach(email => {
      const name = emailToName.get(email) || email;
      missingLines.push(`${email}|${name}`);
    });

    fs.writeFileSync(missingFile, missingLines.join('\n'), 'utf-8');
    console.log(`✅ Generated missing list: ${missingFile}`);
    console.log(`   Total missing emails: ${missingEmails.size}\n`);

    // Also generate a list of delivered Discord update emails
    const deliveredFile = path.join(process.cwd(), 'discord-update-delivered.txt');
    const deliveredLines: string[] = [];
    
    const sortedDelivered = Array.from(discordDeliveredEmails)
      .filter(email => originalEmails.has(email))
      .sort();
    
    sortedDelivered.forEach(email => {
      const name = emailToName.get(email) || email;
      deliveredLines.push(`${email}|${name}`);
    });

    fs.writeFileSync(deliveredFile, deliveredLines.join('\n'), 'utf-8');
    console.log(`✅ Generated delivered list: ${deliveredFile}`);
    console.log(`   Total delivered Discord update emails: ${sortedDelivered.length}\n`);

    // Generate CSV report
    const csvFile = path.join(process.cwd(), 'discord-update-status.csv');
    const csvLines = ['Email,Name,Status'];
    originalEmails.forEach(email => {
      const name = emailToName.get(email) || email;
      const status = discordDeliveredEmails.has(email) ? 'Delivered' : 'Missing';
      csvLines.push(`"${email}","${name}","${status}"`);
    });
    fs.writeFileSync(csvFile, csvLines.join('\n'), 'utf-8');
    console.log(`📝 Status report written to: ${csvFile}\n`);

    // Show sample of delivered and missing
    if (sortedDelivered.length > 0) {
      console.log('✅ Sample of delivered Discord update emails:\n');
      sortedDelivered.slice(0, 10).forEach((email, index) => {
        const name = emailToName.get(email) || email;
        console.log(`   ${index + 1}. ${name} (${email})`);
      });
      if (sortedDelivered.length > 10) {
        console.log(`   ... and ${sortedDelivered.length - 10} more`);
      }
      console.log('');
    }

    if (missingEmails.size > 0) {
      console.log('❌ Sample of missing Discord update emails:\n');
      sortedMissing.slice(0, 10).forEach((email, index) => {
        const name = emailToName.get(email) || email;
        console.log(`   ${index + 1}. ${name} (${email})`);
      });
      if (missingEmails.size > 10) {
        console.log(`   ... and ${missingEmails.size - 10} more`);
      }
      console.log('');
    }

    console.log('✅ Missing list regenerated successfully!\n');

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

regenerateMissingList();

