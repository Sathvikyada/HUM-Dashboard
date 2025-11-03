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

// Cleanup duplicates
async function cleanupDuplicates() {
  try {
    console.log('🔍 Finding duplicate applicants...\n');
    
    // Get all applicants
    const { data: applicants, error } = await supabase
      .from('applicants')
      .select('id, email, full_name, created_at, status, qr_token');
    
    if (error) throw error;
    
    if (!applicants || applicants.length === 0) {
      console.log('No applicants found');
      return;
    }
    
    // Find duplicates by email
    const emailMap = new Map<string, any[]>();
    
    for (const applicant of applicants) {
      const email = applicant.email.toLowerCase().trim();
      if (!emailMap.has(email)) {
        emailMap.set(email, []);
      }
      emailMap.get(email)!.push(applicant);
    }
    
    const emailDuplicates = Array.from(emailMap.entries())
      .filter(([_, applicants]) => applicants.length > 1);
    
    console.log(`Found ${emailDuplicates.length} email duplicate groups\n`);
    
    let deleted = 0;
    let skipped = 0;
    
    for (const [email, dups] of emailDuplicates) {
      // Sort by created_at, newest first
      const sorted = dups.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      // Keep the newest one
      const keep = sorted[0];
      const toDelete = sorted.slice(1);
      
      console.log(`\n📧 ${email}`);
      console.log(`   Keeping: ${keep.id} (created: ${new Date(keep.created_at).toLocaleString()}) - LATEST`);
      
      for (const dup of toDelete) {
        // Skip if this duplicate has been decided or has a QR token
        if (dup.status !== 'pending' || dup.qr_token) {
          console.log(`   ⚠️  Skipping ${dup.id} (has status=${dup.status} or QR token)`);
          skipped++;
          continue;
        }
        
        console.log(`   Deleting: ${dup.id} (created: ${new Date(dup.created_at).toLocaleString()})`);
        
        const { error: deleteError } = await supabase
          .from('applicants')
          .delete()
          .eq('id', dup.id);
        
        if (deleteError) {
          console.log(`   ❌ Error: ${deleteError.message}`);
        } else {
          deleted++;
        }
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Cleanup complete!');
    console.log(`   Deleted: ${deleted}`);
    console.log(`   Skipped: ${skipped}`);
    
  } catch (err: any) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

// Run it
cleanupDuplicates();

