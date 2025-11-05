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

async function verifyDiscordUpdate() {
  try {
    console.log('🔍 Verifying Discord update email delivery...\n');

    // Read the delivered emails list
    const listFile = path.join(process.cwd(), 'delivered-emails-list.txt');
    if (!fs.existsSync(listFile)) {
      console.error('❌ delivered-emails-list.txt not found');
      console.log('   Run "npm run generate-delivered-emails" first to generate the list');
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

    // Get delivered Discord update emails
    const { data: discordDeliveredLogs, error: logsError } = await supabase
      .from('email_logs')
      .select('applicant_email, created_at')
      .eq('event_type', 'delivered')
      .ilike('subject', '%HackUMass XIII - Updated Discord Link%')
      .order('created_at', { ascending: false });

    if (logsError) {
      console.error('❌ Error fetching Discord update delivery logs:', logsError.message);
      process.exit(1);
    }

    const discordDeliveredSet = new Set(
      (discordDeliveredLogs || []).map(log => log.applicant_email.toLowerCase())
    );

    console.log(`📧 Found ${discordDeliveredLogs?.length || 0} Discord update delivery events`);
    console.log(`   Unique delivered emails: ${discordDeliveredSet.size}\n`);

    // Find missing deliveries
    const missingDeliveries: string[] = [];
    originalEmails.forEach(email => {
      if (!discordDeliveredSet.has(email)) {
        missingDeliveries.push(email);
      }
    });

    // Generate report
    console.log('='.repeat(80));
    console.log('📊 VERIFICATION REPORT');
    console.log('='.repeat(80));
    console.log(`\n📋 Original list: ${originalEmails.size} emails`);
    console.log(`✅ Verified delivered: ${discordDeliveredSet.size} emails`);
    console.log(`❌ Missing deliveries: ${missingDeliveries.length} emails`);
    console.log(`📊 Coverage: ${Math.round((discordDeliveredSet.size / originalEmails.size) * 100)}%`);
    console.log(`✅ All covered: ${missingDeliveries.length === 0 ? 'Yes' : 'No'}\n`);

    if (missingDeliveries.length > 0) {
      console.log('📋 Missing Deliveries:\n');
      missingDeliveries.forEach((email, index) => {
        const name = emailToName.get(email) || email;
        console.log(`${index + 1}. ${name} (${email})`);
      });

      // Write missing emails to file
      const missingFile = path.join(process.cwd(), 'missing-discord-updates.txt');
      const missingLines = missingDeliveries.map(email => {
        const name = emailToName.get(email) || email;
        return `${email}|${name}`;
      });
      fs.writeFileSync(missingFile, missingLines.join('\n'), 'utf-8');
      console.log(`\n📝 Missing emails written to: ${missingFile}\n`);
    } else {
      console.log('✅ All emails from the original list have been delivered!\n');
    }

    // Generate CSV report
    const csvFile = path.join(process.cwd(), 'discord-update-verification.csv');
    const csvLines = ['Email,Name,Delivered'];
    originalEmails.forEach(email => {
      const name = emailToName.get(email) || email;
      const delivered = discordDeliveredSet.has(email) ? 'Yes' : 'No';
      csvLines.push(`"${email}","${name}","${delivered}"`);
    });
    fs.writeFileSync(csvFile, csvLines.join('\n'), 'utf-8');
    console.log(`📝 Verification report written to: ${csvFile}\n`);

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

verifyDiscordUpdate();

