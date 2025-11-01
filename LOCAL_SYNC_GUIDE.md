# Local Google Sheets to Supabase Sync

Run this script to populate your database before deploying to Netlify.

## Setup

1. **Make sure you have a `.env` file** with these variables:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
   GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
   ```

2. **Install dependencies** (if you haven't already):
   ```bash
   npm install
   ```

3. **Run the script**:
   ```bash
   npm run sync-sheets
   ```

## What It Does

- Connects to Google Sheets using Service Account credentials
- Reads all rows from columns A-Z
- Maps data to: Email, Full Name, University, Graduation Year
- Stores ALL form responses in the `responses` JSONB field
- Upserts by email (won't duplicate, updates existing records)
- Shows progress every 50 rows
- Reports final count

## Expected Output

```
🔄 Fetching data from Google Sheets...
📊 Found 1234 rows
✅ Processed 50/1234...
✅ Processed 100/1234...
...
✅ Sync complete!
   Inserted/Updated: 1234
   Errors: 0
```

## Troubleshooting

**Error: Missing SUPABASE_URL**
- Make sure your `.env` file exists and has correct values

**Error: Failed to get Google access token**
- Check GOOGLE_SERVICE_ACCOUNT_EMAIL and PRIVATE_KEY
- Make sure service account has sheet access in Google Drive

**Error: No rows found**
- Check GOOGLE_SHEETS_SPREADSHEET_ID
- Verify sheet has data and is accessible

**Wrong column mapping**
- Edit the script at lines 99-104 to match your sheet columns
- Current mapping:
  - Email → `row['Email']` or `row['email']`
  - Full Name → `row['First Name'] + row['Last Name']` OR `row['Full Name']` OR `row['Name']`
  - University → `row['University']`
  - Graduation Year → `row['Graduation Year']` or `row['Grad Year']`

## After Running

Check your Supabase `applicants` table to verify data loaded correctly.

