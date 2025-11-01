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
  
  // Handle private key formatting - support both quoted and unquoted formats
  let privateKey = privateKeyRaw;
  
  // Remove surrounding quotes if present
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  
  // Replace literal \n with actual newlines
  privateKey = privateKey.replace(/\\n/g, '\n');
  
  if (!spreadsheetId || !svcEmail || !privateKey || privateKey.trim() === '') {
    throw new Error('Google Sheets env vars not set or invalid');
  }

  // JWT token creation
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
  const signature = signer.createSign('RSA-SHA256')
    .update(`${jwtHeader}.${jwtClaim}`)
    .end();
  
  const signatureBase64 = signature.sign(privateKey, 'base64url');
  const assertion = `${jwtHeader}.${jwtClaim}.${signatureBase64}`;

  // Get access token
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

  // Read sheet
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

// Main sync function
async function sync() {
  try {
    console.log('🔄 Fetching data from Google Sheets...');
    const rows = await fetchSheet();
    console.log(`📊 Found ${rows.length} rows`);

    let inserted = 0;
    let errors = 0;

    for (const row of rows) {
      const email = row['Email'] || row['email'];
      if (!email) {
        console.warn('⚠️  Skipping row with no email');
        continue;
      }

      // Combine first and last name if separated
      const first_name = row['First Name'] || row['First name'] || '';
      const last_name = row['Last Name'] || row['Last name'] || '';
      const full_name = first_name && last_name 
        ? `${first_name} ${last_name}`.trim()
        : row['Full Name'] || row['Name'] || '';
      
      const university = row['University/ College'] || row['University'] || '';
      const graduation_year = row['Graduation Year'] || row['Grad Year'] || '';
      const responses = row;

      const { error } = await supabase
        .from('applicants')
        .upsert(
          { email, full_name, university, graduation_year, responses },
          { onConflict: 'email' }
        );

      if (error) {
        console.error(`❌ Error upserting ${email}:`, error.message);
        errors++;
      } else {
        inserted++;
        if (inserted % 50 === 0) {
          console.log(`✅ Processed ${inserted}/${rows.length}...`);
        }
      }
    }

    console.log('\n✅ Sync complete!');
    console.log(`   Inserted/Updated: ${inserted}`);
    console.log(`   Errors: ${errors}`);
  } catch (err: any) {
    console.error('❌ Sync failed:', err.message);
    process.exit(1);
  }
}

// Run it
sync();

