import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// Find duplicates
async function findDuplicates() {
  try {
    console.log('🔍 Finding duplicate applicants...\n');
    
    // Get all applicants
    const { data: applicants, error } = await supabase
      .from('applicants')
      .select('id, email, full_name, created_at, responses');
    
    if (error) throw error;
    
    if (!applicants || applicants.length === 0) {
      console.log('No applicants found');
      return;
    }
    
    console.log(`📊 Total applicants in database: ${applicants.length}\n`);
    
    // Find duplicates by email
    const emailMap = new Map<string, any[]>();
    const nameMap = new Map<string, any[]>();
    
    for (const applicant of applicants) {
      // Group by email
      const email = applicant.email.toLowerCase().trim();
      if (!emailMap.has(email)) {
        emailMap.set(email, []);
      }
      emailMap.get(email)!.push(applicant);
      
      // Group by normalized name
      const name = applicant.full_name.toLowerCase().trim().replace(/\s+/g, ' ');
      if (!nameMap.has(name)) {
        nameMap.set(name, []);
      }
      nameMap.get(name)!.push(applicant);
    }
    
    // Find email duplicates
    const emailDuplicates = Array.from(emailMap.entries())
      .filter(([_, applicants]) => applicants.length > 1);
    
    // Find name duplicates (but not email duplicates)
    const nameOnlyDuplicates = Array.from(nameMap.entries())
      .filter(([_, applicants]) => 
        applicants.length > 1 && 
        applicants.every(a => !emailMap.get(a.email.toLowerCase().trim()) || emailMap.get(a.email.toLowerCase().trim())!.length === 1)
      );
    
    console.log('📧 DUPLICATE EMAILS (same email, multiple records):');
    console.log('=' .repeat(80));
    
    if (emailDuplicates.length === 0) {
      console.log('✅ No duplicate emails found\n');
    } else {
      console.log(`⚠️  Found ${emailDuplicates.length} duplicate email groups:\n`);
      
      for (const [email, dups] of emailDuplicates) {
        console.log(`\n📧 Email: ${email}`);
        console.log(`   Count: ${dups.length} records`);
        for (const dup of dups) {
          console.log(`   - ID: ${dup.id}`);
          console.log(`     Name: ${dup.full_name}`);
          console.log(`     Created: ${new Date(dup.created_at).toLocaleString()}`);
          
          // Show responses email if different
          const responses = dup.responses as Record<string, any>;
          const responsesEmail = responses['Email'] || responses['email'];
          if (responsesEmail && responsesEmail.toLowerCase() !== email) {
            console.log(`     Responses Email: ${responsesEmail} ⚠️ MISMATCH`);
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n👤 DUPLICATE NAMES (same name, different emails):');
    console.log('=' .repeat(80));
    
    if (nameOnlyDuplicates.length === 0) {
      console.log('✅ No duplicate names found\n');
    } else {
      console.log(`⚠️  Found ${nameOnlyDuplicates.length} potential duplicate name groups:\n`);
      
      let shown = 0;
      for (const [name, dups] of nameOnlyDuplicates) {
        if (shown >= 10) {
          console.log(`\n... and ${nameOnlyDuplicates.length - shown} more name duplicate groups`);
          break;
        }
        shown++;
        
        console.log(`\n👤 Name: ${name}`);
        console.log(`   Count: ${dups.length} records`);
        for (const dup of dups) {
          console.log(`   - Email: ${dup.email}`);
          console.log(`     ID: ${dup.id}`);
          console.log(`     Created: ${new Date(dup.created_at).toLocaleString()}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 SUMMARY:');
    console.log(`   Total applicants: ${applicants.length}`);
    console.log(`   Unique emails: ${emailMap.size}`);
    console.log(`   Unique names: ${nameMap.size}`);
    console.log(`   Email duplicates: ${emailDuplicates.reduce((sum, [_, dups]) => sum + dups.length - 1, 0)} extra records`);
    console.log(`   Name duplicates: ${nameOnlyDuplicates.reduce((sum, [_, dups]) => sum + dups.length - 1, 0)} potential duplicates`);
    
    if (emailDuplicates.length > 0) {
      console.log('\n⚠️  RECOMMENDATION: Review and merge email duplicates');
    }
    
  } catch (err: any) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

// Run it
findDuplicates();

