import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
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

// Find XLSX file
function findXlsxFile(): string | null {
  const files = fs.readdirSync(process.cwd()).filter(f => 
    f.endsWith('.xlsx') && 
    (f.includes('Early Apps') || f.includes('UMass') || f.includes('applicants'))
  );
  
  if (files.length === 0) {
    const exactName = '[List of applicants] Early Apps + UMass students.xlsx';
    if (fs.existsSync(path.join(process.cwd(), exactName))) {
      return exactName;
    }
    return null;
  }
  
  return files[0];
}

async function verifyXlsxInDb() {
  try {
    const xlsxFile = findXlsxFile();
    if (!xlsxFile) {
      console.error('❌ XLSX file not found');
      process.exit(1);
    }

    const xlsxPath = path.join(process.cwd(), xlsxFile);
    console.log(`📂 Reading XLSX file: ${xlsxFile}\n`);

    const workbook = XLSX.readFile(xlsxPath);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false }) as Array<Record<string, any>>;

    console.log(`📊 Found ${rows.length} rows in XLSX file\n`);

    const emailCol = 'Email Address';
    const emailsFromXlsx: string[] = [];
    const emailsWithNoEmail: number[] = [];

    // Extract all emails from XLSX (keep original casing for reference, but use lowercase for deduplication)
    const emailMap = new Map<string, string>(); // lowercase -> original casing
    rows.forEach((row, index) => {
      const email = (row[emailCol] || '').toString().trim();
      if (!email) {
        emailsWithNoEmail.push(index + 2); // +2 because index starts at 0 and we removed header
      } else {
        const emailLower = email.toLowerCase();
        emailsFromXlsx.push(emailLower);
        // Store original casing (use first occurrence if duplicates)
        if (!emailMap.has(emailLower)) {
          emailMap.set(emailLower, email);
        }
      }
    });

    const uniqueEmailsFromXlsx = [...new Set(emailsFromXlsx)];

    console.log(`📋 Extracted ${emailsFromXlsx.length} emails from XLSX`);
    console.log(`   Unique emails: ${uniqueEmailsFromXlsx.length}`);
    console.log(`   Rows without email: ${emailsWithNoEmail.length}`);
    if (emailsWithNoEmail.length > 0) {
      console.log(`   Rows with no email: ${emailsWithNoEmail.join(', ')}\n`);
    } else {
      console.log('');
    }

    // Check each email in database
    const found: Array<{ email: string; dbEmail: string; name: string; university: string }> = [];
    const notFound: Array<{ email: string; originalCase: string }> = [];

    console.log('🔍 Checking emails in database...\n');

    for (const email of uniqueEmailsFromXlsx) {
      // Try case-insensitive match first (most common case)
      let { data, error } = await supabase
        .from('applicants')
        .select('email, full_name, university')
        .ilike('email', email)
        .single();

      // If not found with ilike, try exact match with original casing from XLSX
      if (error || !data) {
        const originalCase = emailMap.get(email) || email;
        const { data: exactData, error: exactError } = await supabase
          .from('applicants')
          .select('email, full_name, university')
          .eq('email', originalCase)
          .single();

        if (exactData && !exactError) {
          data = exactData;
          error = null;
        }
      }

      // If still not found, try with first letter capitalized
      if (error || !data) {
        const capitalized = email.charAt(0).toUpperCase() + email.slice(1);
        const { data: capData, error: capError } = await supabase
          .from('applicants')
          .select('email, full_name, university')
          .eq('email', capitalized)
          .single();

        if (capData && !capError) {
          data = capData;
          error = null;
        }
      }

      if (error || !data) {
        notFound.push({
          email: email,
          originalCase: emailMap.get(email) || email
        });
      } else {
        found.push({
          email: email,
          dbEmail: data.email, // Exact email as stored in DB
          name: data.full_name,
          university: data.university || 'N/A'
        });
      }
    }

    // Report results
    console.log(`\n✅ Found in database: ${found.length}/${uniqueEmailsFromXlsx.length}\n`);

    if (found.length > 0) {
      console.log(`📋 Successfully imported (showing first 10):\n`);
      found.slice(0, 10).forEach((item, idx) => {
        console.log(`   ${idx + 1}. ${item.dbEmail}`);
        console.log(`      Name: ${item.name}`);
        console.log(`      University: ${item.university}`);
        console.log('');
      });
      if (found.length > 10) {
        console.log(`   ... and ${found.length - 10} more\n`);
      }
    }

    if (notFound.length > 0) {
      console.log(`\n❌ NOT FOUND in database: ${notFound.length}/${uniqueEmailsFromXlsx.length}\n`);
      console.log('📋 Missing emails (with original casing from XLSX):\n');
      notFound.forEach((item, idx) => {
        console.log(`   ${idx + 1}. ${item.originalCase} (lowercase: ${item.email})`);
      });
      console.log('');
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Found: ${found.length}/${uniqueEmailsFromXlsx.length} (${Math.round((found.length / uniqueEmailsFromXlsx.length) * 100)}%)`);
    console.log(`   ❌ Not Found: ${notFound.length}/${uniqueEmailsFromXlsx.length}`);
    console.log(`   ⚠️  No email in XLSX: ${emailsWithNoEmail.length} rows`);
    
    if (notFound.length === 0 && emailsWithNoEmail.length === 0) {
      console.log(`\n🎉 SUCCESS: All applications from XLSX are in the database!`);
    } else if (notFound.length === 0) {
      console.log(`\n✅ All emails from XLSX are in the database (${emailsWithNoEmail.length} rows had no email to import)`);
    } else {
      console.log(`\n⚠️  ${notFound.length} email(s) from XLSX are missing from the database`);
    }

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

verifyXlsxInDb();
