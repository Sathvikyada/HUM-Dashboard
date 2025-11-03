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

// Google Sheets fetching
async function fetchSheet(): Promise<Array<Record<string, string>>> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const svcEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
  
  let privateKey = privateKeyRaw;
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');
  
  if (!spreadsheetId || !svcEmail || !privateKey || privateKey.trim() === '') {
    throw new Error('Google Sheets env vars not set or invalid');
  }

  const jwtHeader = toBase64Json({ alg: 'RS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const jwtClaim = toBase64Json({
    iss: svcEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });
  
  const signer = await import('node:crypto');
  const signatureBase64 = signer.createSign('RSA-SHA256')
    .update(`${jwtHeader}.${jwtClaim}`)
    .end()
    .sign(privateKey, 'base64url');
  
  const assertion = `${jwtHeader}.${jwtClaim}.${signatureBase64}`;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ 
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', 
      assertion 
    }),
  }).then(r => r.json() as any);

  const accessToken = tokenResp.access_token;
  if (!accessToken) throw new Error('Failed to get Google access token');

  const valuesResp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:Z`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  ).then(r => r.json() as any);

  const rows: string[][] = valuesResp.values || [];
  const headers = rows.shift() || [];
  
  return rows.map(r => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h.trim()] = (r[i] || '').trim()));
    return obj;
  });
}

function toBase64Json(obj: any): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

// Diagnose missing applicants
async function diagnose() {
  try {
    console.log('🔍 Fetching data from Google Sheets...');
    const sheetRows = await fetchSheet();
    console.log(`📊 Found ${sheetRows.length} rows in sheet\n`);
    
    console.log('🔍 Fetching data from database...');
    const { data: dbRows, error } = await supabase
      .from('applicants')
      .select('email, full_name');
    
    if (error) throw error;
    
    console.log(`📊 Found ${dbRows!.length} rows in database\n`);
    
    // Create sets of emails
    const sheetEmails = new Set(sheetRows.map(row => {
      const email = row['Email'] || row['email'] || '';
      return email.toLowerCase().trim();
    }).filter(Boolean));
    
    const dbEmails = new Set(dbRows!.map(row => row.email.toLowerCase().trim()));
    
    console.log(`📊 Sheet has ${sheetEmails.size} unique emails`);
    console.log(`📊 Database has ${dbEmails.size} unique emails\n`);
    
    // Find emails in sheet but not in database
    const missingInDb = Array.from(sheetEmails).filter(email => !dbEmails.has(email));
    console.log(`⚠️  Missing in database: ${missingInDb.length}\n`);
    
    if (missingInDb.length > 0) {
      console.log('📋 First 20 missing emails:');
      missingInDb.slice(0, 20).forEach(email => {
        const row = sheetRows.find(r => {
          const e = r['Email'] || r['email'] || '';
          return e.toLowerCase().trim() === email;
        });
        console.log(`   - ${email}`);
        if (row) {
          console.log(`     Name: ${row['Full Name'] || row['First Name'] + ' ' + row['Last Name'] || 'N/A'}`);
        }
      });
      
      if (missingInDb.length > 20) {
        console.log(`   ... and ${missingInDb.length - 20} more`);
      }
    }
    
    // Find emails in database but not in sheet
    const extraInDb = Array.from(dbEmails).filter(email => !sheetEmails.has(email));
    console.log(`\n⚠️  Extra in database (not in sheet): ${extraInDb.length}\n`);
    
    if (extraInDb.length > 0) {
      console.log('📋 Extra emails in database:');
      extraInDb.slice(0, 20).forEach(email => {
        const row = dbRows!.find(r => r.email.toLowerCase().trim() === email);
        console.log(`   - ${email}`);
        if (row) {
          console.log(`     Name: ${row.full_name}`);
        }
      });
      
      if (extraInDb.length > 20) {
        console.log(`   ... and ${extraInDb.length - 20} more`);
      }
    }
    
    // Count rows without emails
    const noEmailInSheet = sheetRows.filter(row => !row['Email'] && !row['email']);
    console.log(`\n⚠️  Rows in sheet without email: ${noEmailInSheet.length}`);
    
    if (noEmailInSheet.length > 0) {
      console.log('First 10 rows without email:');
      noEmailInSheet.slice(0, 10).forEach(row => {
        console.log(`   - ${row['Full Name'] || row['First Name'] + ' ' + row['Last Name'] || 'N/A'}`);
      });
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 SUMMARY:');
    console.log(`   Total rows in sheet: ${sheetRows.length}`);
    console.log(`   Rows with emails: ${sheetEmails.size}`);
    console.log(`   Rows without emails: ${noEmailInSheet.length}`);
    console.log(`   Total in database: ${dbRows!.length}`);
    console.log(`   Missing in database: ${missingInDb.length}`);
    console.log(`   Extra in database: ${extraInDb.length}`);
    console.log(`   Net difference: ${sheetEmails.size - dbEmails.size}`);
    
  } catch (err: any) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

// Run it
diagnose();

