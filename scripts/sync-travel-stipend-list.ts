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
    const xlsxPath = path.join(process.cwd(), 'Travel Stipend Final List (3).xlsx');
    
    if (!fs.existsSync(xlsxPath)) {
      console.error(`❌ File not found: ${xlsxPath}`);
      process.exit(1);
    }

    console.log('📂 Reading Travel Stipend Final List (3).xlsx...\n');
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
        // Check if applicant exists - use case-insensitive email lookup first
        let { data: existingApplicant, error: fetchError } = await supabase
          .from('applicants')
          .select('id, email, full_name, status, responses')
          .ilike('email', email)
          .maybeSingle();

        // If not found and we have a name, try name-based lookup as fallback
        if ((fetchError || !existingApplicant) && fullName && fullName !== email) {
          console.log(`⚠️  Email not found for ${email}, trying name-based lookup for "${fullName}"...`);
          
          // Try multiple name matching strategies
          const nameParts = fullName.trim().split(/\s+/);
          const firstName = nameParts[0];
          const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
          
          let nameMatch = null;
          
          // Strategy 1: First and last name
          if (firstName && lastName) {
            const { data: match1, error: nameError1 } = await supabase
              .from('applicants')
              .select('id, email, full_name, status, responses')
              .ilike('full_name', `%${firstName}%`)
              .ilike('full_name', `%${lastName}%`)
              .maybeSingle();
            
            if (!nameError1 && match1) {
              nameMatch = match1;
            }
          }
          
          // Strategy 2: Just first name (if first strategy didn't work)
          if (!nameMatch && firstName) {
            const { data: match2, error: nameError2 } = await supabase
              .from('applicants')
              .select('id, email, full_name, status, responses')
              .ilike('full_name', `${firstName}%`)
              .maybeSingle();
            
            if (!nameError2 && match2) {
              nameMatch = match2;
            }
          }
          
          if (nameMatch) {
            console.log(`✅ Found by name: ${nameMatch.full_name} (${nameMatch.email}) - Excel had: ${email}`);
            existingApplicant = nameMatch;
            fetchError = null;
          } else {
            console.log(`❌ Name-based lookup also failed for "${fullName}"`);
          }
        }

        const travelStipendData = {
          proof,
          stipend_amount: stipendAmount,
          general_early_app: generalEarlyApp,
        };

        const isEarly = generalEarlyApp.toLowerCase() === 'early';
        const isGeneral = generalEarlyApp.toLowerCase() === 'general';

        if (fetchError || !existingApplicant) {
          // Applicant doesn't exist in database
          if (isEarly) {
            // Early: Add new applicant with full name, email, proof, and stipend amount
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
              results.newApplicants.push({
                email,
                name: fullName || email,
                type: 'Early App (new)',
              });
            }
          } else if (isGeneral) {
            // General: Skip if applicant doesn't exist (General implies they should already exist)
            results.skipped.push({
              email,
              name: fullName || email,
              reason: 'General applicant not found in database (General applicants should already exist)',
            });
          } else {
            // Unknown type, skip
            results.skipped.push({
              email,
              name: fullName || email,
              reason: `Unknown General/Early App value: "${generalEarlyApp}"`,
            });
          }
        } else {
          // Applicant exists in database
          if (isEarly) {
            // Early: Update existing applicant's responses.json with proof and stipend amount
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
              results.updatedApplicants.push({
                email,
                name: existingApplicant.full_name || email,
                type: 'Early App (updated)',
              });
            }
          } else if (isGeneral) {
            // General: Update existing applicant's responses.json with proof and stipend amount
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
              results.updatedApplicants.push({
                email,
                name: existingApplicant.full_name || email,
                type: 'General App (updated)',
              });
            }
          } else {
            // Unknown type, skip
            results.skipped.push({
              email,
              name: existingApplicant.full_name || email,
              reason: `Unknown General/Early App value: "${generalEarlyApp}"`,
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

    // Verify new applicants are pending
    console.log('='.repeat(80));
    console.log('🔍 VERIFICATION');
    console.log('='.repeat(80));
    
    const newApplicantEmails = results.newApplicants.map(a => a.email);
    const updatedApplicantEmails = results.updatedApplicants.map(a => a.email);

    if (newApplicantEmails.length > 0) {
      const { data: newApplicants, error: verifyError } = await supabase
        .from('applicants')
        .select('email, full_name, status')
        .in('email', newApplicantEmails);

      if (!verifyError && newApplicants) {
        const nonPending = newApplicants.filter(a => a.status !== 'pending');
        
        if (nonPending.length === 0) {
          console.log(`\n✅ SUCCESS: All ${newApplicantEmails.length} new applicants are pending!\n`);
        } else {
          console.log(`\n⚠️  WARNING: ${nonPending.length} new applicants are NOT pending:\n`);
          nonPending.forEach(app => {
            console.log(`   - ${app.full_name || app.email} (${app.email}): ${app.status}`);
          });
          console.log('');
        }
      }
    }

    if (updatedApplicantEmails.length > 0) {
      console.log(`\n✅ Updated ${updatedApplicantEmails.length} existing applicants with travel stipend data.\n`);
    }

    if (newApplicantEmails.length === 0 && updatedApplicantEmails.length === 0) {
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

