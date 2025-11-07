import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';
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

async function exportAcceptedApplicants() {
  try {
    console.log('📂 Fetching all accepted applicants from database...\n');
    
    // Fetch all accepted applicants
    const { data: applicants, error } = await supabase
      .from('applicants')
      .select('full_name, email')
      .eq('status', 'accepted')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('❌ Error fetching applicants:', error);
      process.exit(1);
    }

    if (!applicants || applicants.length === 0) {
      console.log('⚠️ No accepted applicants found in database');
      return;
    }

    console.log(`✅ Found ${applicants.length} accepted applicants\n`);

    // Prepare data for Excel
    const excelData = applicants.map(app => ({
      'Full Name': app.full_name || '',
      'Email': app.email || '',
    }));

    // Create workbook
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 30 }, // Full Name column
      { wch: 40 }, // Email column
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Accepted Applicants');

    // Write to file
    const outputPath = path.join(process.cwd(), 'accepted-applicants.xlsx');
    XLSX.writeFile(workbook, outputPath);

    console.log(`✅ Excel file created: ${outputPath}\n`);
    console.log(`📊 Total accepted applicants: ${applicants.length}\n`);
    console.log('First 10 applicants:');
    applicants.slice(0, 10).forEach((app, idx) => {
      console.log(`  ${idx + 1}. ${app.full_name || 'N/A'} (${app.email})`);
    });
    if (applicants.length > 10) {
      console.log(`  ... and ${applicants.length - 10} more`);
    }
    console.log('\n');

  } catch (err: any) {
    console.error('❌ Error exporting accepted applicants:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

exportAcceptedApplicants();

