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

async function generateDeliveredEmailsList() {
  try {
    console.log('🔍 Generating list of delivered emails...\n');

    // Get all accepted applicants first
    const { data: acceptedApplicants, error: acceptedError } = await supabase
      .from('applicants')
      .select('email, full_name')
      .eq('status', 'accepted');

    if (acceptedError) {
      console.error('❌ Error fetching accepted applicants:', acceptedError.message);
      process.exit(1);
    }

    if (!acceptedApplicants || acceptedApplicants.length === 0) {
      console.log('⚠️  No accepted applicants found');
      process.exit(0);
    }

    const acceptedEmails = new Set(
      acceptedApplicants.map(app => app.email.toLowerCase())
    );

    console.log(`✅ Found ${acceptedApplicants.length} accepted applicants\n`);

    // Get all delivered emails
    const { data: deliveredLogs, error: logsError } = await supabase
      .from('email_logs')
      .select('applicant_email, subject')
      .eq('event_type', 'delivered')
      .order('created_at', { ascending: false });

    if (logsError) {
      console.error('❌ Error fetching delivered emails:', logsError.message);
      process.exit(1);
    }

    // Filter to only accepted applicants who received emails
    const deliveredEmails = new Set<string>();
    const acceptanceEmails = new Set<string>();
    const emailToName = new Map<string, string>();

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
    const emailsToUse = acceptanceEmails.size > 0 ? acceptanceEmails : deliveredEmails;

    // Get names for emails
    acceptedApplicants.forEach(app => {
      const emailLower = app.email.toLowerCase();
      if (emailsToUse.has(emailLower)) {
        emailToName.set(emailLower, app.full_name || app.email);
      }
    });

    console.log(`📧 Total delivery logs: ${deliveredLogs?.length || 0}`);
    console.log(`📧 Accepted applicants with delivered emails: ${deliveredEmails.size}`);
    console.log(`📧 Accepted applicants with acceptance emails: ${acceptanceEmails.size}`);
    console.log(`📧 Using ${emailsToUse.size} emails (${acceptanceEmails.size > 0 ? 'acceptance emails' : 'all delivered emails'})\n`);

    if (emailsToUse.size === 0) {
      console.log('⚠️  No delivered emails found for accepted applicants');
      process.exit(0);
    }

    // Generate list file
    const outputFile = path.join(process.cwd(), 'delivered-emails-list.txt');
    const lines: string[] = [];

    // Add header
    lines.push('# HackUMass Discord Update Email List');
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push(`# Total emails: ${emailsToUse.size}`);
    lines.push(`# Format: email|name`);
    lines.push('');

    // Add emails
    const sortedEmails = Array.from(emailsToUse).sort();
    sortedEmails.forEach(email => {
      const name = emailToName.get(email) || email;
      lines.push(`${email}|${name}`);
    });

    // Write to file
    fs.writeFileSync(outputFile, lines.join('\n'), 'utf-8');

    console.log(`✅ Generated delivered emails list: ${outputFile}`);
    console.log(`   Total emails: ${emailsToUse.size}\n`);

    // Also generate a simple email-only list
    const emailOnlyFile = path.join(process.cwd(), 'delivered-emails-only.txt');
    const emailLines = sortedEmails.map(email => email);
    fs.writeFileSync(emailOnlyFile, emailLines.join('\n'), 'utf-8');

    console.log(`✅ Generated email-only list: ${emailOnlyFile}`);
    console.log(`   Format: One email per line\n`);

    // Generate CSV for easy import
    const csvFile = path.join(process.cwd(), 'delivered-emails.csv');
    const csvLines = ['Email,Name'];
    sortedEmails.forEach(email => {
      const name = emailToName.get(email) || email;
      csvLines.push(`"${email}","${name}"`);
    });
    fs.writeFileSync(csvFile, csvLines.join('\n'), 'utf-8');

    console.log(`✅ Generated CSV file: ${csvFile}`);
    console.log(`   Format: CSV with Email,Name columns\n`);

    console.log('📋 Summary:');
    console.log(`   Total accepted applicants: ${acceptedApplicants.length}`);
    console.log(`   Delivered emails found: ${emailsToUse.size}`);
    console.log(`   Coverage: ${Math.round((emailsToUse.size / acceptedApplicants.length) * 100)}%\n`);

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

generateDeliveredEmailsList();

