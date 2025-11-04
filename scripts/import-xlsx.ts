import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

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

// Find XLSX file in current directory
function findXlsxFile(): string | null {
  const files = fs.readdirSync(process.cwd()).filter(f => 
    f.endsWith('.xlsx') && 
    (f.includes('Early Apps') || f.includes('UMass') || f.includes('applicants'))
  );
  
  if (files.length === 0) {
    // Try the exact name
    const exactName = '[List of applicants] Early Apps + UMass students.xlsx';
    if (fs.existsSync(path.join(process.cwd(), exactName))) {
      return exactName;
    }
    return null;
  }
  
  return files[0];
}

// Parse timestamp string (handles format like "9/14/2025 20:48:17")
function parseTimestamp(ts: any): Date | null {
  if (!ts) return null;
  try {
    // Handle Excel date serial numbers
    if (typeof ts === 'number') {
      // Excel date serial number - convert to JS Date
      const excelEpoch = new Date(1899, 11, 30);
      const msSinceExcelEpoch = (ts - 1) * 86400 * 1000;
      return new Date(excelEpoch.getTime() + msSinceExcelEpoch);
    }
    // Handle string dates
    const parsed = new Date(ts);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function importXlsx() {
  try {
    const xlsxFile = findXlsxFile();
    if (!xlsxFile) {
      console.error('❌ XLSX file not found in current directory');
      console.log('   Looking for files containing: "Early Apps", "UMass", or "applicants"');
      console.log('   Or exact name: "[List of applicants] Early Apps + UMass students.xlsx"');
      process.exit(1);
    }

    const xlsxPath = path.join(process.cwd(), xlsxFile);
    console.log(`📂 Reading file: ${xlsxFile}\n`);

    const workbook = XLSX.readFile(xlsxPath);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false }) as Array<Record<string, any>>;

    console.log(`📊 Found ${rows.length} rows in sheet "${firstSheetName}"\n`);

    if (rows.length === 0) {
      console.log('⚠️  No data rows found');
      process.exit(0);
    }

    // Map columns based on actual XLSX structure
    const emailCol = 'Email Address';
    const firstNameCol = 'First Name';
    const lastNameCol = 'Last Name';
    const universityCol = 'What university/ college do you attend?';
    const graduationCol = 'What is your graduation year?';
    const timestampCol = 'kk'; // The timestamp column name from inspection

    console.log('🔍 Column Mapping:');
    console.log(`   Email: ${emailCol}`);
    console.log(`   Name: ${firstNameCol} + ${lastNameCol}`);
    console.log(`   University: ${universityCol}`);
    console.log(`   Graduation: ${graduationCol}`);
    console.log(`   Timestamp: ${timestampCol}\n`);

    // Verify columns exist
    const firstRow = rows[0];
    if (!firstRow[emailCol]) {
      console.error(`❌ Email column "${emailCol}" not found`);
      console.log('   Available columns:', Object.keys(firstRow).join(', '));
      process.exit(1);
    }

    // Step 1: Group rows by email and keep latest timestamp
    const emailRows: Record<string, { row: Record<string, any>; timestamp: Date | null }> = {};
    let skippedNoEmail = 0;

    for (const row of rows) {
      const email = (row[emailCol] || '').toString().trim().toLowerCase();
      if (!email) {
        skippedNoEmail++;
        continue;
      }

      const timestamp = timestampCol && row[timestampCol] ? parseTimestamp(row[timestampCol]) : null;

      // Keep the row with the latest timestamp, or the first one if no timestamp
      if (!emailRows[email] || 
          (timestamp && emailRows[email].timestamp && timestamp > emailRows[email].timestamp!) ||
          (!emailRows[email].timestamp && timestamp)) {
        emailRows[email] = { row, timestamp };
      }
    }

    const uniqueRows = Object.values(emailRows).map(({ row }) => row);
    console.log(`📋 After deduplication: ${uniqueRows.length} unique emails`);
    console.log(`   Skipped (no email): ${skippedNoEmail}`);
    console.log(`   Removed duplicates: ${rows.length - skippedNoEmail - uniqueRows.length}\n`);

    // Step 2: Import to database using safe upsert
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    console.log('🔄 Starting import...\n');

    for (const row of uniqueRows) {
      const email = (row[emailCol] || '').toString().trim();
      
      // Build full name
      const first = (row[firstNameCol] || '').toString().trim();
      const last = (row[lastNameCol] || '').toString().trim();
      const full_name = `${first} ${last}`.trim() || email; // Fallback to email if no name

      const university = row[universityCol] ? (row[universityCol] || '').toString().trim() : '';
      const graduation_year = row[graduationCol] ? (row[graduationCol] || '').toString().trim() : '';
      
      // Store all original data in responses JSONB
      const responses: Record<string, any> = {};
      Object.keys(row).forEach(key => {
        responses[key] = row[key];
      });

      // Check if record already exists
      const { data: existing } = await supabase
        .from('applicants')
        .select('id')
        .eq('email', email)
        .single();

      const { error } = await supabase
        .from('applicants')
        .upsert(
          { 
            email, 
            full_name, 
            university, 
            graduation_year, 
            responses 
          },
          { onConflict: 'email' }
        );

      if (error) {
        console.error(`❌ Error upserting ${email}:`, error.message);
        errors++;
      } else {
        if (existing) {
          updated++;
        } else {
          inserted++;
        }
        if ((inserted + updated) % 25 === 0) {
          console.log(`✅ Processed ${inserted + updated}/${uniqueRows.length}...`);
        }
      }
    }

    console.log('\n✅ Import complete!');
    console.log(`   New records: ${inserted}`);
    console.log(`   Updated records: ${updated}`);
    console.log(`   Errors: ${errors}`);
    console.log(`\n💡 This import used upsert, so existing records were safely updated, not duplicated.`);
    console.log(`   All ${Object.keys(firstRow).length} columns from XLSX are stored in the 'responses' JSONB field.`);

  } catch (err: any) {
    console.error('❌ Import failed:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

importXlsx();
