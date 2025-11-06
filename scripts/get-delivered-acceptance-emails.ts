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

async function getDeliveredAcceptanceEmails() {
  try {
    console.log('📂 Fetching delivered acceptance emails from email_logs...\n');
    
    // Get all delivered emails - first check what's actually in the database
    console.log('📧 Checking all delivered emails...');
    
    // First, get all delivered emails - fetch all of them (no limit)
    // We'll need to paginate if there are too many
    let allDeliveredLogs: Array<{ applicant_email: string; event_type: string; created_at: string; subject: string | null }> = [];
    let offset = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: pageLogs, error: allLogsError } = await supabase
        .from('email_logs')
        .select('applicant_email, event_type, created_at, subject')
        .eq('event_type', 'delivered')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (allLogsError) {
        console.error('❌ Error fetching email logs:', allLogsError);
        process.exit(1);
      }

      if (pageLogs && pageLogs.length > 0) {
        allDeliveredLogs = allDeliveredLogs.concat(pageLogs);
        offset += PAGE_SIZE;
        hasMore = pageLogs.length === PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    console.log(`📧 Found ${allDeliveredLogs.length} total delivered email events\n`);

    // Log sample subjects to see what we're working with
    if (allDeliveredLogs && allDeliveredLogs.length > 0) {
      const uniqueSubjects = new Set<string>();
      allDeliveredLogs.forEach(log => {
        if (log.subject) {
          uniqueSubjects.add(log.subject);
        }
      });
      console.log(`📋 Found ${uniqueSubjects.size} unique subjects in delivered emails:\n`);
      Array.from(uniqueSubjects).slice(0, 10).forEach((subject, idx) => {
        console.log(`  ${idx + 1}. ${subject}`);
      });
      if (uniqueSubjects.size > 10) {
        console.log(`  ... and ${uniqueSubjects.size - 10} more`);
      }
      console.log('\n');
    }

    // Since subjects might be empty, we'll filter by checking if applicants are accepted in the database
    // First, get all unique emails from delivered emails
    const uniqueEmailsFromLogs = new Set<string>();
    (allDeliveredLogs || []).forEach(log => {
      if (log.applicant_email) {
        uniqueEmailsFromLogs.add(log.applicant_email.toLowerCase());
      }
    });

    console.log(`📧 Found ${uniqueEmailsFromLogs.size} unique emails in delivered logs\n`);

    // Remove the two denied emails
    const deniedEmails = ['arnavpalawat@gmail.com', 'tyler@borisshoes.net'].map(e => e.toLowerCase());
    deniedEmails.forEach(email => {
      uniqueEmailsFromLogs.delete(email);
    });

    console.log(`✅ Removed ${deniedEmails.length} denied emails from the list\n`);
    console.log(`📧 Remaining unique emails: ${uniqueEmailsFromLogs.size}\n`);

    // Get all applicants with these emails (not just accepted)
    // Split into batches if needed (Supabase has a limit on IN queries)
    const emailsArray = Array.from(uniqueEmailsFromLogs);
    const BATCH_SIZE = 500;
    let allApplicants: Array<{ email: string; full_name: string; status: string }> = [];
    
    for (let i = 0; i < emailsArray.length; i += BATCH_SIZE) {
      const batch = emailsArray.slice(i, i + BATCH_SIZE);
      const { data: batchApplicants, error: applicantsError } = await supabase
        .from('applicants')
        .select('email, full_name, status')
        .in('email', batch);
      
      if (applicantsError) {
        console.error('⚠️ Error fetching batch:', applicantsError);
      } else if (batchApplicants) {
        allApplicants = allApplicants.concat(batchApplicants);
      }
    }

    console.log(`✅ Found ${allApplicants.length} applicants with delivered emails\n`);

    // Filter email logs to only include emails that are in our list (after removing denied ones)
    const emailLogs = (allDeliveredLogs || []).filter(log => {
      const email = log.applicant_email?.toLowerCase();
      return email && uniqueEmailsFromLogs.has(email);
    });

    console.log(`📧 Filtered to ${emailLogs.length} acceptance-related delivered emails\n`);

    // Get unique emails
    const uniqueEmails = new Set<string>();
    const emailDetails = new Map<string, { deliveredAt: string; subject: string }>();

    (emailLogs || []).forEach(log => {
      const email = log.applicant_email.toLowerCase();
      uniqueEmails.add(email);
      if (!emailDetails.has(email)) {
        emailDetails.set(email, {
          deliveredAt: log.created_at,
          subject: log.subject || '',
        });
      }
    });

    console.log(`✅ Found ${uniqueEmails.size} unique delivered emails (after removing denied)\n`);

    // Create a map of email to name from all applicants we fetched
    const emailToName = new Map<string, string>();
    allApplicants.forEach(app => {
      emailToName.set(app.email.toLowerCase(), app.full_name || app.email);
    });

    // Create list with names
    const emailList = Array.from(uniqueEmails).map(email => {
      const details = emailDetails.get(email) || { deliveredAt: '', subject: '' };
      return {
        email,
        name: emailToName.get(email) || email,
        deliveredAt: details.deliveredAt,
        subject: details.subject,
      };
    }).sort((a, b) => a.email.localeCompare(b.email));

    // Write to file
    const outputPath = path.join(process.cwd(), 'discord-update-emails.txt');
    const emailListText = emailList.map(item => item.email).join('\n');
    fs.writeFileSync(outputPath, emailListText);
    console.log(`✅ Email list written to: ${outputPath}\n`);

    // Write detailed CSV
    const csvPath = path.join(process.cwd(), 'discord-update-emails-detailed.csv');
    const csvHeader = 'Email,Name,Delivered At,Subject\n';
    const csvRows = emailList.map(item => 
      `"${item.email}","${item.name}","${item.deliveredAt}","${item.subject}"`
    ).join('\n');
    fs.writeFileSync(csvPath, csvHeader + csvRows);
    console.log(`✅ Detailed CSV written to: ${csvPath}\n`);

    // Print summary
    console.log('================================================================================');
    console.log('📊 SUMMARY');
    console.log('================================================================================');
    console.log(`Total unique delivered emails: ${uniqueEmails.size}`);
    console.log(`Denied emails removed: ${deniedEmails.length} (${deniedEmails.join(', ')})`);
    console.log(`\nFirst 10 emails:`);
    emailList.slice(0, 10).forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.name} (${item.email})`);
    });
    if (emailList.length > 10) {
      console.log(`  ... and ${emailList.length - 10} more`);
    }
    console.log('================================================================================\n');

  } catch (err: any) {
    console.error('❌ Error getting delivered acceptance emails:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

getDeliveredAcceptanceEmails();

