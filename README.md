HackUMass Application Dashboard

Deploys on Netlify: frontend (Vite React) + functions + scheduled sync.

Setup
- Create Supabase and run supabase_schema.sql
- Create Google Service Account with Sheet read access
- Set env in Netlify: ADMIN_API_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SG_API_KEY (SendGrid), EMAIL_FROM, GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, EVENT_SLUG, BASE_APP_URL
- Deploy; cron calls sync-from-sheets every 15 min

Local
- npm i
- npx netlify dev

Usage
- Dashboard: enter Admin Token, Accept/Waitlist/Deny (emails sent; accept includes QR)
- Scanner: scans QR and marks check-in

Customize
- Email: netlify/functions/_utils/email.ts
- Sheet mapping: netlify/functions/sync-from-sheets.ts

