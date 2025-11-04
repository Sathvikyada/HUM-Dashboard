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

async function countApplicants() {
  try {
    // Count all applicants
    const { count, error } = await supabase
      .from('applicants')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('❌ Error counting applicants:', error.message);
      process.exit(1);
    }

    console.log(`\n📊 Total applicants in database: ${count}\n`);

    // Also get a breakdown
    const { data: statusBreakdown, error: statusError } = await supabase
      .from('applicants')
      .select('status');

    if (!statusError && statusBreakdown) {
      const breakdown: Record<string, number> = {};
      statusBreakdown.forEach(a => {
        breakdown[a.status] = (breakdown[a.status] || 0) + 1;
      });
      
      console.log('📈 Status Breakdown:');
      Object.entries(breakdown).forEach(([status, count]) => {
        console.log(`   ${status}: ${count}`);
      });
    }

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

countApplicants();
