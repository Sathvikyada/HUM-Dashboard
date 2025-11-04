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

async function verifyImport() {
  try {
    // Get all applicants
    const { data: allApplicants, error: fetchError } = await supabase
      .from('applicants')
      .select('email, full_name, university, graduation_year, status, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (fetchError) {
      console.error('❌ Error fetching applicants:', fetchError.message);
      process.exit(1);
    }

    if (!allApplicants || allApplicants.length === 0) {
      console.log('⚠️  No applicants found');
      return;
    }

    // Check for applicants that might be from XLSX import (recently updated)
    const recent = allApplicants.filter(a => {
      const updated = new Date(a.updated_at);
      const now = new Date();
      const diffMs = now.getTime() - updated.getTime();
      const diffMins = diffMs / (1000 * 60);
      return diffMins < 5; // Updated in last 5 minutes
    });

    console.log(`\n📊 Total applicants: ${allApplicants.length}`);
    console.log(`📝 Recently updated (likely from XLSX import): ${recent.length}\n`);

    if (recent.length > 0) {
      console.log('✅ Sample records from XLSX import (first 5):\n');
      recent.slice(0, 5).forEach((app, idx) => {
        console.log(`   ${idx + 1}. ${app.full_name} (${app.email})`);
        console.log(`      University: ${app.university || '❌ Missing'}`);
        console.log(`      Graduation Year: ${app.graduation_year || '❌ Missing'}`);
        console.log(`      Status: ${app.status}`);
        console.log(`      Updated: ${new Date(app.updated_at).toLocaleString()}`);
        console.log('');
      });
    }

    // Check data quality
    console.log('\n📈 Data Quality Check:\n');
    
    const withEmail = allApplicants.filter(a => a.email && a.email.trim() !== '').length;
    const withName = allApplicants.filter(a => a.full_name && a.full_name.trim() !== '').length;
    const withUniversity = allApplicants.filter(a => a.university && a.university.trim() !== '').length;
    const withGradYear = allApplicants.filter(a => a.graduation_year && a.graduation_year.trim() !== '').length;

    console.log(`   ✅ Valid emails: ${withEmail}/${allApplicants.length} (${Math.round(withEmail/allApplicants.length*100)}%)`);
    console.log(`   ✅ Valid names: ${withName}/${allApplicants.length} (${Math.round(withName/allApplicants.length*100)}%)`);
    console.log(`   ✅ Has university: ${withUniversity}/${allApplicants.length} (${Math.round(withUniversity/allApplicants.length*100)}%)`);
    console.log(`   ✅ Has graduation year: ${withGradYear}/${allApplicants.length} (${Math.round(withGradYear/allApplicants.length*100)}%)`);

    // Check for specific XLSX imported emails (sample from the XLSX file)
    const xlsxEmails = [
      'eccerasoli@umass.edu',
      'khangdaniel.tran@gmail.com',
      'nkinsman16@gmail.com'
    ];

    console.log('\n🔍 Verifying specific XLSX imported records:\n');
    for (const email of xlsxEmails) {
      const { data: app, error } = await supabase
        .from('applicants')
        .select('email, full_name, university, graduation_year, responses')
        .eq('email', email)
        .single();

      if (error || !app) {
        console.log(`   ❌ ${email}: NOT FOUND`);
      } else {
        console.log(`   ✅ ${email}:`);
        console.log(`      Name: ${app.full_name}`);
        console.log(`      University: ${app.university || 'N/A'}`);
        console.log(`      Graduation: ${app.graduation_year || 'N/A'}`);
        
        // Check if responses JSONB has XLSX-specific fields
        const responses = app.responses as Record<string, any> || {};
        const hasXlsxFields = responses['What university/ college do you attend?'] || responses['kk'] || responses['Email Address'];
        console.log(`      Has XLSX data in responses: ${hasXlsxFields ? '✅ Yes' : '⚠️  No'}`);
        console.log('');
      }
    }

    console.log('✅ Verification complete!\n');

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

verifyImport();
