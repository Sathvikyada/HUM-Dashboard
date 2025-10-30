import type { Handler } from '@netlify/functions';
import { supabaseAdmin } from './_utils/supabaseClient';

// Minimal Google Sheets fetch via v4 API
// Assumes first row is headers and includes at least: Email, Full Name, University, Graduation Year

async function fetchSheet(): Promise<Array<Record<string, string>>> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID as string;
  const svcEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL as string;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!spreadsheetId || !svcEmail || !privateKey) throw new Error('Google Sheets env vars not set');

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
  const signature = signer.createSign('RSA-SHA256').update(`${jwtHeader}.${jwtClaim}`).end().sign(privateKey, 'base64url');
  const assertion = `${jwtHeader}.${jwtClaim}.${signature}`;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  }).then(r => r.json() as any);

  const accessToken = tokenResp.access_token as string;
  if (!accessToken) throw new Error('Failed to get Google access token');

  // Read first sheet A:Z (adjust if needed)
  const valuesResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A:Z`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then(r => r.json() as any);

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

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      // allow manual trigger without auth for simplicity but can be restricted
    }
    const rows = await fetchSheet();
    let inserted = 0;
    for (const row of rows) {
      const email = row['Email'] || row['email'];
      if (!email) continue;
      const full_name = row['Full Name'] || row['Name'] || '';
      const university = row['University'] || '';
      const graduation_year = row['Graduation Year'] || row['Grad Year'] || '';
      const responses = row;

      const { error } = await supabaseAdmin
        .from('applicants')
        .upsert(
          { email, full_name, university, graduation_year, responses },
          { onConflict: 'email' }
        );
      if (!error) inserted++;
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, upserted: inserted }) };
  } catch (err: any) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
};

