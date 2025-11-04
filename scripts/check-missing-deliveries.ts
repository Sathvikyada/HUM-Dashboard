import { createClient } from '@supabase/supabase-js';
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

async function checkMissingDeliveries() {
  try {
    console.log('🔍 Analyzing email delivery status...\n');

    // Step 1: Get all unique email addresses from email_logs where event_type = 'delivered'
    console.log('📧 Fetching delivered emails from email_logs...');
    const { data: deliveredLogs, error: logsError } = await supabase
      .from('email_logs')
      .select('applicant_email, created_at')
      .eq('event_type', 'delivered');

    if (logsError) {
      console.error('❌ Error fetching email logs:', logsError.message);
      process.exit(1);
    }

    // Get unique delivered emails
    const deliveredEmails = new Set(
      (deliveredLogs || []).map(log => log.applicant_email.toLowerCase())
    );

    console.log(`✅ Found ${deliveredLogs?.length || 0} delivery events`);
    console.log(`   Unique delivered emails: ${deliveredEmails.size}\n`);

    // Step 2: Get all accepted applicants
    console.log('👥 Fetching accepted applicants...');
    const { data: acceptedApplicants, error: applicantsError } = await supabase
      .from('applicants')
      .select('id, email, full_name, status, decided_by, updated_at')
      .eq('status', 'accepted')
      .order('updated_at', { ascending: false });

    if (applicantsError) {
      console.error('❌ Error fetching applicants:', applicantsError.message);
      process.exit(1);
    }

    console.log(`✅ Found ${acceptedApplicants?.length || 0} accepted applicants\n`);

    // Step 3: Cross-reference to find missing deliveries
    const missingDeliveries: Array<{
      email: string;
      full_name: string;
      decided_by: string | null;
      updated_at: string;
    }> = [];

    for (const applicant of acceptedApplicants || []) {
      const emailLower = applicant.email.toLowerCase();
      if (!deliveredEmails.has(emailLower)) {
        missingDeliveries.push({
          email: applicant.email,
          full_name: applicant.full_name,
          decided_by: applicant.decided_by,
          updated_at: applicant.updated_at,
        });
      }
    }

    // Step 4: Get ALL bounced emails (not just missing deliveries)
    console.log('🔍 Checking for ALL bounced emails...\n');
    
    const { data: allBounced, error: bounceError } = await supabase
      .from('email_logs')
      .select('applicant_email, event_type, reason, created_at, subject')
      .eq('event_type', 'bounce')
      .order('created_at', { ascending: false });

    // Also check for other email events for missing deliveries
    const missingEmails = missingDeliveries.map(m => m.email);
    const { data: otherEvents, error: eventsError } = await supabase
      .from('email_logs')
      .select('applicant_email, event_type, reason, created_at')
      .in('applicant_email', missingEmails)
      .in('event_type', ['bounce', 'dropped', 'deferred']);

    const emailEventMap = new Map<string, Array<{ event: string; reason?: string; date: string }>>();
    
    if (!eventsError && otherEvents) {
      for (const event of otherEvents) {
        const emailLower = event.applicant_email.toLowerCase();
        if (!emailEventMap.has(emailLower)) {
          emailEventMap.set(emailLower, []);
        }
        emailEventMap.get(emailLower)!.push({
          event: event.event_type,
          reason: event.reason || undefined,
          date: event.created_at,
        });
      }
    }

    // Step 5: Create a consolidated report of all issues
    console.log('='.repeat(80));
    console.log('📊 COMPLETE DELIVERY ANALYSIS REPORT');
    console.log('='.repeat(80));
    
    const deliveredCount = (acceptedApplicants || []).filter(a => 
      deliveredEmails.has(a.email.toLowerCase())
    ).length;

    console.log(`\n📈 SUMMARY:`);
    console.log(`   Total accepted applicants: ${acceptedApplicants?.length || 0}`);
    console.log(`   ✅ Confirmed delivered: ${deliveredCount}`);
    console.log(`   ❌ Missing delivery: ${missingDeliveries.length}`);
    console.log(`   Delivery rate: ${acceptedApplicants && acceptedApplicants.length > 0 
      ? Math.round((deliveredCount / acceptedApplicants.length) * 100) 
      : 0}%\n`);

    // Step 6: Analyze ALL bounced emails
    if (!bounceError && allBounced) {
      console.log('\n' + '='.repeat(80));
      console.log('📧 ALL BOUNCED EMAILS ANALYSIS');
      console.log('='.repeat(80));
      console.log(`\n✅ Total bounced emails: ${allBounced.length}\n`);

      // Get unique bounced emails
      const uniqueBouncedEmails = new Set(allBounced.map(b => b.applicant_email.toLowerCase()));
      console.log(`   Unique bounced email addresses: ${uniqueBouncedEmails.size}\n`);

      // Categorize bounces
      const mailLoopBounces: typeof allBounced = [];
      const invalidDomainBounces: typeof allBounced = [];
      const otherBounces: typeof allBounced = [];

      for (const bounce of allBounced) {
        const reason = (bounce.reason || '').toLowerCase();
        if (reason.includes('hop count exceeded') || reason.includes('mail loop')) {
          mailLoopBounces.push(bounce);
        } else if (reason.includes('unable to get mx info') || reason.includes('unrecognized address')) {
          invalidDomainBounces.push(bounce);
        } else {
          otherBounces.push(bounce);
        }
      }

      // Get accepted applicants who bounced
      const acceptedBouncedEmails = new Set(
        (acceptedApplicants || [])
          .filter(a => uniqueBouncedEmails.has(a.email.toLowerCase()))
          .map(a => a.email.toLowerCase())
      );

      console.log('📊 Bounce Categories:');
      console.log(`   🔄 Mail Loop (Hop count exceeded): ${mailLoopBounces.length}`);
      console.log(`   ❌ Invalid Domain/MX: ${invalidDomainBounces.length}`);
      console.log(`   ⚠️  Other bounce reasons: ${otherBounces.length}`);
      console.log(`   ✅ Accepted applicants who bounced: ${acceptedBouncedEmails.size}\n`);

      // Show mail loop bounces
      if (mailLoopBounces.length > 0) {
        console.log('🔄 Mail Loop Bounces (Hop count exceeded - possible email forwarding issue):\n');
        const uniqueMailLoop = new Map<string, typeof allBounced[0]>();
        mailLoopBounces.forEach(b => {
          const emailLower = b.applicant_email.toLowerCase();
          if (!uniqueMailLoop.has(emailLower)) {
            uniqueMailLoop.set(emailLower, b);
          }
        });

        uniqueMailLoop.forEach((bounce, email) => {
          const isAccepted = acceptedBouncedEmails.has(email);
          console.log(`   ${isAccepted ? '✅ ACCEPTED' : '⏳ PENDING'} - ${bounce.applicant_email}`);
          console.log(`      Reason: ${bounce.reason || 'No reason provided'}`);
          console.log(`      Time: ${new Date(bounce.created_at).toLocaleString()}`);
          console.log('');
        });

        console.log(`\n   💡 Note: Mail loop errors typically indicate email forwarding issues.`);
        console.log(`   These are likely legitimate UMass emails with forwarding configuration problems.\n`);
      }

      // Show invalid domain bounces
      if (invalidDomainBounces.length > 0) {
        console.log('❌ Invalid Domain/MX Bounces:\n');
        const uniqueInvalid = new Map<string, typeof allBounced[0]>();
        invalidDomainBounces.forEach(b => {
          const emailLower = b.applicant_email.toLowerCase();
          if (!uniqueInvalid.has(emailLower)) {
            uniqueInvalid.set(emailLower, b);
          }
        });

        uniqueInvalid.forEach((bounce, email) => {
          const isAccepted = acceptedBouncedEmails.has(email);
          console.log(`   ${isAccepted ? '✅ ACCEPTED' : '⏳ PENDING'} - ${bounce.applicant_email}`);
          console.log(`      Reason: ${bounce.reason || 'No reason provided'}`);
          console.log(`      Time: ${new Date(bounce.created_at).toLocaleString()}`);
          console.log('');
        });

        console.log(`\n   💡 Note: These emails have invalid domains or MX records.\n`);
      }

      // Show other bounces
      if (otherBounces.length > 0) {
        console.log('⚠️  Other Bounce Reasons:\n');
        const uniqueOther = new Map<string, typeof allBounced[0]>();
        otherBounces.forEach(b => {
          const emailLower = b.applicant_email.toLowerCase();
          if (!uniqueOther.has(emailLower)) {
            uniqueOther.set(emailLower, b);
          }
        });

        uniqueOther.forEach((bounce, email) => {
          const isAccepted = acceptedBouncedEmails.has(email);
          console.log(`   ${isAccepted ? '✅ ACCEPTED' : '⏳ PENDING'} - ${bounce.applicant_email}`);
          console.log(`      Reason: ${bounce.reason || 'No reason provided'}`);
          console.log(`      Time: ${new Date(bounce.created_at).toLocaleString()}`);
          console.log('');
        });
      }

      // CSV export for all bounced emails
      console.log('\n📝 CSV Format - All Bounced Emails:');
      console.log('Email,Reason,Bounce Time,Is Accepted');
      const uniqueAllBounced = new Map<string, typeof allBounced[0]>();
      allBounced.forEach(b => {
        const emailLower = b.applicant_email.toLowerCase();
        if (!uniqueAllBounced.has(emailLower)) {
          uniqueAllBounced.set(emailLower, b);
        }
      });
      
      uniqueAllBounced.forEach((bounce, email) => {
        const isAccepted = acceptedBouncedEmails.has(email);
        console.log(`"${bounce.applicant_email}","${bounce.reason || 'No reason'}","${bounce.created_at}","${isAccepted ? 'Yes' : 'No'}"`);
      });
    }

    // Summary stats (deliveredCount already calculated above)
    console.log('\n' + '='.repeat(80));
    console.log('📈 SUMMARY STATISTICS');
    console.log('='.repeat(80));
    console.log(`   Total accepted: ${acceptedApplicants?.length || 0}`);
    console.log(`   Confirmed delivered: ${deliveredCount}`);
    console.log(`   Missing delivery: ${missingDeliveries.length}`);
    console.log(`   Delivery rate: ${acceptedApplicants && acceptedApplicants.length > 0 
      ? Math.round((deliveredCount / acceptedApplicants.length) * 100) 
      : 0}%\n`);

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

checkMissingDeliveries();

