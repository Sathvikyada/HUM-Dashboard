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

// Fix university field
async function fixUniversity() {
  try {
    console.log('🔍 Fetching all applicants...');
    
    // Get all applicants
    const { data, error } = await supabase
      .from('applicants')
      .select('id, email, university, responses');
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      console.log('No applicants found');
      return;
    }
    
    console.log(`📊 Found ${data.length} applicants to check`);
    
    let updated = 0;
    let skipped = 0;
    
    for (const applicant of data) {
      // Skip if university is already populated
      if (applicant.university && applicant.university.trim() !== '') {
        skipped++;
        continue;
      }
      
      // Try to get university from responses
      const responses = applicant.responses || {};
      const universityFromResponses = 
        responses['University/ College'] || 
        responses['University'] || 
        responses['College'] ||
        responses['university'] ||
        '';
      
      if (universityFromResponses && universityFromResponses.trim() !== '') {
        // Update the university field
        const { error: updateError } = await supabase
          .from('applicants')
          .update({ university: universityFromResponses.trim() })
          .eq('id', applicant.id);
        
        if (updateError) {
          console.error(`❌ Error updating ${applicant.email}:`, updateError.message);
        } else {
          updated++;
          console.log(`✅ Updated ${applicant.email}: ${universityFromResponses.trim()}`);
        }
      } else {
        skipped++;
        console.log(`⚠️  No university found for ${applicant.email}`);
      }
    }
    
    console.log('\n✅ Update complete!');
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    
  } catch (err: any) {
    console.error('❌ Update failed:', err.message);
    process.exit(1);
  }
}

// Run it
fixUniversity();

