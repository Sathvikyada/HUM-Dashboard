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

async function syncTravelStipendList() {
  try {
    const xlsxPath = path.join(process.cwd(), 'Travel Stipend Final List.xlsx');
    
    if (!fs.existsSync(xlsxPath)) {
      console.error(`❌ File not found: ${xlsxPath}`);
      process.exit(1);
    }

    console.log('📂 Reading Travel Stipend Final List.xlsx...\n');
    const workbook = XLSX.readFile(xlsxPath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false }) as Array<Record<string, any>>;

    console.log(`📊 Found ${rows.length} rows in Excel file\n`);

    const results = {
      newApplicants: [] as Array<{ email: string; name: string; type: string }>,
      updatedApplicants: [] as Array<{ email: string; name: string; type: string }>,
      skipped: [] as Array<{ email: string; name: string; reason: string }>,
      errors: [] as Array<{ email: string; error: string }>,
    };

    // Process each row
    for (const row of rows) {
      const email = (row['Email'] || '').toString().trim().toLowerCase();
      const firstName = (row['First Name'] || '').toString().trim();
      const lastName = (row['Last Name'] || '').toString().trim();
      const fullName = `${firstName} ${lastName}`.trim();
      const proof = (row['Proof'] || '').toString().trim();
      const stipendAmount = (row['Stipend Amount'] || '').toString().trim();
      const generalEarlyApp = (row['General/Early App'] || '').toString().trim();

      if (!email) {
        results.skipped.push({
          email: 'N/A',
          name: fullName || 'N/A',
          reason: 'No email provided',
        });
        continue;
      }

      try {
        // Check if applicant exists
        const { data: existingApplicant, error: fetchError } = await supabase
          .from('applicants')
          .select('id, email, full_name, status, responses')
          .eq('email', email)
          .single();

        const travelStipendData = {
          proof,
          stipend_amount: stipendAmount,
          general_early_app: generalEarlyApp,
        };

        if (fetchError || !existingApplicant) {
          // New applicant - add them regardless of Early/General if not found
          // Create new applicant with pending status
          const responses: Record<string, any> = {
            ...travelStipendData,
          };

          const { error: insertError } = await supabase
            .from('applicants')
            .insert({
              email,
              full_name: fullName || email,
              status: 'pending',
              responses,
            });

          if (insertError) {
            results.errors.push({
              email,
              error: insertError.message,
            });
          } else {
            const appType = generalEarlyApp.toLowerCase() === 'early' ? 'Early App (new)' : 'General App (new)';
            results.newApplicants.push({
              email,
              name: fullName || email,
              type: appType,
            });
          }
        } else {
          // Existing applicant - update with travel stipend data if pending
          // Verify applicant is pending before updating
          if (existingApplicant.status !== 'pending') {
            results.skipped.push({
              email,
              name: existingApplicant.full_name || email,
              reason: `Status is "${existingApplicant.status}" (must be pending to update)`,
            });
            continue;
          }

          // Merge travel stipend data into existing responses
          const existingResponses = existingApplicant.responses || {};
          const updatedResponses = {
            ...existingResponses,
            ...travelStipendData,
          };

          const { error: updateError } = await supabase
            .from('applicants')
            .update({
              responses: updatedResponses,
            })
            .eq('id', existingApplicant.id);

          if (updateError) {
            results.errors.push({
              email,
              error: updateError.message,
            });
          } else {
            const appType = generalEarlyApp.toLowerCase() === 'early' ? 'Early App (updated)' : 'General App (updated)';
            results.updatedApplicants.push({
              email,
              name: existingApplicant.full_name || email,
              type: appType,
            });
          }
        }
      } catch (err: any) {
        results.errors.push({
          email,
          error: err.message || 'Unknown error',
        });
      }
    }

    // Generate log file
    const logPath = path.join(process.cwd(), 'travel-stipend-sync-log.txt');
    const timestamp = new Date().toISOString();
    let logContent = `Travel Stipend Sync Log\n`;
    logContent += `Generated: ${timestamp}\n`;
    logContent += `Total rows processed: ${rows.length}\n\n`;
    logContent += `=== SUMMARY ===\n`;
    logContent += `New applicants added: ${results.newApplicants.length}\n`;
    logContent += `Existing applicants updated: ${results.updatedApplicants.length}\n`;
    logContent += `Skipped: ${results.skipped.length}\n`;
    logContent += `Errors: ${results.errors.length}\n\n`;

    if (results.newApplicants.length > 0) {
      logContent += `=== NEW APPLICANTS ADDED ===\n`;
      results.newApplicants.forEach((item, idx) => {
        logContent += `${idx + 1}. ${item.name} (${item.email}) - ${item.type}\n`;
      });
      logContent += `\n`;
    }

    if (results.updatedApplicants.length > 0) {
      logContent += `=== EXISTING APPLICANTS UPDATED ===\n`;
      results.updatedApplicants.forEach((item, idx) => {
        logContent += `${idx + 1}. ${item.name} (${item.email}) - ${item.type}\n`;
      });
      logContent += `\n`;
    }

    if (results.skipped.length > 0) {
      logContent += `=== SKIPPED ===\n`;
      results.skipped.forEach((item, idx) => {
        logContent += `${idx + 1}. ${item.name} (${item.email}) - ${item.reason}\n`;
      });
      logContent += `\n`;
    }

    if (results.errors.length > 0) {
      logContent += `=== ERRORS ===\n`;
      results.errors.forEach((item, idx) => {
        logContent += `${idx + 1}. ${item.email} - ${item.error}\n`;
      });
      logContent += `\n`;
    }

    fs.writeFileSync(logPath, logContent);
    console.log(`✅ Log written to: ${logPath}\n`);

    // Print summary
    console.log('='.repeat(80));
    console.log('📊 SYNC SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n📋 Total rows processed: ${rows.length}`);
    console.log(`✅ New applicants added: ${results.newApplicants.length}`);
    console.log(`🔄 Existing applicants updated: ${results.updatedApplicants.length}`);
    console.log(`⏭️  Skipped: ${results.skipped.length}`);
    console.log(`❌ Errors: ${results.errors.length}\n`);

    if (results.newApplicants.length > 0) {
      console.log('✅ New applicants added:\n');
      results.newApplicants.forEach((item, idx) => {
        console.log(`   ${idx + 1}. ${item.name} (${item.email})`);
      });
      console.log('');
    }

    if (results.updatedApplicants.length > 0) {
      console.log('🔄 Existing applicants updated:\n');
      results.updatedApplicants.forEach((item, idx) => {
        console.log(`   ${idx + 1}. ${item.name} (${item.email})`);
      });
      console.log('');
    }

    if (results.skipped.length > 0) {
      console.log('⏭️  Skipped applicants:\n');
      results.skipped.forEach((item, idx) => {
        console.log(`   ${idx + 1}. ${item.name} (${item.email}) - ${item.reason}`);
      });
      console.log('');
    }

    if (results.errors.length > 0) {
      console.log('❌ Errors:\n');
      results.errors.forEach((item, idx) => {
        console.log(`   ${idx + 1}. ${item.email} - ${item.error}`);
      });
      console.log('');
    }

    // Verify that only pending/new applications were modified
    console.log('='.repeat(80));
    console.log('🔍 VERIFICATION');
    console.log('='.repeat(80));
    
    const allModifiedEmails = [
      ...results.newApplicants.map(a => a.email),
      ...results.updatedApplicants.map(a => a.email),
    ];

    if (allModifiedEmails.length > 0) {
      const { data: modifiedApplicants, error: verifyError } = await supabase
        .from('applicants')
        .select('email, full_name, status')
        .in('email', allModifiedEmails);

      if (!verifyError && modifiedApplicants) {
        const nonPending = modifiedApplicants.filter(a => a.status !== 'pending');
        
        if (nonPending.length === 0) {
          console.log(`\n✅ SUCCESS: All ${allModifiedEmails.length} modified applicants are pending!\n`);
        } else {
          console.log(`\n⚠️  WARNING: ${nonPending.length} modified applicants are NOT pending:\n`);
          nonPending.forEach(app => {
            console.log(`   - ${app.full_name || app.email} (${app.email}): ${app.status}`);
          });
          console.log('');
        }
      }
    } else {
      console.log('\nℹ️  No applicants were modified.\n');
    }

    console.log('✅ Sync complete!\n');

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

syncTravelStipendList();

