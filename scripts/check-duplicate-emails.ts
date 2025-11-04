import dotenv from 'dotenv';

dotenv.config();

// Google Sheets fetching (same logic as sync script)
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
  const signature = signer.createSign('RSA-SHA256')
    .update(`${jwtHeader}.${jwtClaim}`)
    .end();
  
  const signatureBase64 = signature.sign(privateKey, 'base64url');
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

async function checkDuplicates() {
  try {
    console.log('🔄 Fetching data from Google Sheets...\n');
    const rows = await fetchSheet();
    
    const emailCounts: Record<string, number> = {};
    const emailRows: Record<string, Array<{ row: number; data: Record<string, string> }>> = {};
    let rowsWithEmail = 0;
    let rowsWithoutEmail = 0;

    rows.forEach((row, index) => {
      const email = (row['Email'] || row['email'] || '').toLowerCase().trim();
      if (!email) {
        rowsWithoutEmail++;
        return;
      }
      
      rowsWithEmail++;
      emailCounts[email] = (emailCounts[email] || 0) + 1;
      
      if (!emailRows[email]) {
        emailRows[email] = [];
      }
      emailRows[email].push({ row: index + 2, data: row }); // +2 because index starts at 0 and we removed header
    });

    const uniqueEmails = Object.keys(emailCounts);
    const duplicateEmails = uniqueEmails.filter(email => emailCounts[email] > 1);

    console.log('📊 Summary:');
    console.log(`   Total rows (excluding header): ${rows.length}`);
    console.log(`   Rows with email: ${rowsWithEmail}`);
    console.log(`   Rows without email: ${rowsWithoutEmail}`);
    console.log(`   Unique emails: ${uniqueEmails.length}`);
    console.log(`   Duplicate emails: ${duplicateEmails.length}\n`);

    if (duplicateEmails.length > 0) {
      console.log(`⚠️  Found ${duplicateEmails.length} duplicate emails:\n`);
      
      duplicateEmails.forEach(email => {
        console.log(`   📧 ${email} (appears ${emailCounts[email]} times)`);
        emailRows[email].forEach(({ row, data }) => {
          const first_name = data['First Name'] || data['First name'] || '';
          const last_name = data['Last Name'] || data['Last name'] || '';
          const full_name = first_name && last_name 
            ? `${first_name} ${last_name}`.trim()
            : data['Full Name'] || data['Name'] || '';
          console.log(`      Row ${row}: ${full_name || '(no name)'}`);
        });
        console.log('');
      });

      const totalDuplicateRows = duplicateEmails.reduce((sum, email) => sum + (emailCounts[email] - 1), 0);
      console.log(`\n📝 Explanation:`);
      console.log(`   ${rowsWithEmail} rows have emails`);
      console.log(`   ${uniqueEmails.length} unique emails exist`);
      console.log(`   ${totalDuplicateRows} rows are duplicates`);
      console.log(`   Expected database count: ${uniqueEmails.length} (because upsert updates existing records)`);
      console.log(`   This explains the difference: ${rowsWithEmail} processed vs ${uniqueEmails.length} in database\n`);
    } else {
      console.log('✅ No duplicate emails found in Google Sheets.\n');
      console.log(`   All ${rowsWithEmail} rows with emails should create unique records.\n`);
    }

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkDuplicates();
