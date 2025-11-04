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

const missingEmails = [
  'siley@umass.edu',
  'jlevitan@umass.edu',
  'maleksandrov@umass.edu'
];

async function checkMissing() {
  try {
    console.log('🔍 Checking if missing emails exist in database (with case variations)...\n');

    for (const email of missingEmails) {
      // Try exact match first
      const { data: exact, error: exactError } = await supabase
        .from('applicants')
        .select('email, full_name, university')
        .eq('email', email)
        .single();

      // Try case-insensitive match
      const { data: ilike, error: ilikeError } = await supabase
        .from('applicants')
        .select('email, full_name, university')
        .ilike('email', email)
        .single();

      if (exact && !exactError) {
        console.log(`✅ ${email}: FOUND (exact match)`);
        console.log(`   Name: ${exact.full_name}`);
        console.log(`   University: ${exact.university || 'N/A'}`);
        console.log(`   Stored as: ${exact.email}\n`);
      } else if (ilike && !ilikeError) {
        console.log(`✅ ${email}: FOUND (case-insensitive match)`);
        console.log(`   Name: ${ilike.full_name}`);
        console.log(`   University: ${ilike.university || 'N/A'}`);
        console.log(`   Stored as: ${ilike.email}\n`);
      } else {
        console.log(`❌ ${email}: NOT FOUND in database\n`);
      }
    }

    // Also check if they might be in responses JSONB from XLSX import
    console.log('🔍 Checking if they might be in responses JSONB (from XLSX import)...\n');
    
    for (const email of missingEmails) {
      const { data, error } = await supabase
        .from('applicants')
        .select('email, full_name, university, responses')
        .contains('responses', { 'Email Address': email });

      if (error || !data || data.length === 0) {
        // Try case-insensitive search in responses
        const { data: allApps } = await supabase
          .from('applicants')
          .select('email, full_name, university, responses')
          .limit(1000);

        if (allApps) {
          const found = allApps.find(app => {
            const responses = app.responses as Record<string, any> || {};
            const emailAddr = responses['Email Address'] || '';
            return emailAddr.toLowerCase() === email.toLowerCase();
          });

          if (found) {
            console.log(`⚠️  ${email}: Found in responses JSONB but email field doesn't match`);
            console.log(`   Database email: ${found.email}`);
            console.log(`   Name: ${found.full_name}`);
            console.log(`   University: ${found.university || 'N/A'}\n`);
          }
        }
      }
    }

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkMissing();
