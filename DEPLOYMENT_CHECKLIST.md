# Netlify Deployment Checklist

## ✅ Pre-Deployment Verification

### 1. Database Setup
- [x] Supabase schema created and migrated
- [x] All 764 applicants synced and verified
- [x] University field populated 100%
- [x] All responses data complete

### 2. Code Quality
- [x] All TypeScript builds successfully
- [x] No linter errors
- [x] .env removed from Git history
- [x] .env properly in .gitignore

### 3. Features Working
- [x] Clickable applicant detail modal
- [x] Pagination for 764+ applicants
- [x] Email templates with HackUMass logo
- [x] QR code generation and attachment
- [x] Fallback text if QR doesn't render
- [x] Organizer tracking (decided_by)
- [x] Concurrent decision and check-in support

## ⚙️ Netlify Environment Variables

You **MUST** configure these in Netlify Dashboard → Site Settings → Environment Variables:

### **Required:**
```
ADMIN_API_SECRET=your-secret-token-here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SENDGRID_API_KEY=your-sendgrid-api-key
EMAIL_FROM=team@hackumass.com
EMAIL_LOGO_URL=https://humdashboard.netlify.app/images/HUMXIII.png
GOOGLE_SHEETS_SPREADSHEET_ID=your-spreadsheet-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...your full key...\n-----END PRIVATE KEY-----\n"
```

### **Optional:**
```
ADMIN_EMAIL=hackumass-logs@hackumass.com
EVENT_SLUG=hackumass-xiii
BASE_APP_URL=https://humdashboard.netlify.app
```

## 📝 Deployment Steps

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

### Step 2: Connect to Netlify
1. Go to https://app.netlify.com
2. Click "Add new site" → "Import an existing project"
3. Connect to GitHub
4. Select your repository: `HUM-Dashboard`

### Step 3: Configure Build Settings
Netlify should auto-detect from `netlify.toml`:
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

### Step 4: Add Environment Variables
1. Go to Site Settings → Environment Variables
2. Add **all** the variables listed above
3. **CRITICAL**: For `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, paste the entire key including BEGIN/END markers with `\n` characters

### Step 5: Deploy
1. Click "Deploy site"
2. Wait for build to complete
3. Check build logs for errors

### Step 6: Verify Deployment
1. Visit your site URL: `https://humdashboard.netlify.app`
2. Navigate to Dashboard
3. Enter your ADMIN_API_SECRET
4. Verify applicants load
5. Test viewing an applicant detail
6. Test pagination

### Step 7: Test Email Sending
1. Accept/waitlist/deny a test applicant
2. Verify email received
3. Verify QR code is visible (for accepted)
4. Verify fallback text if QR doesn't load

### Step 8: Verify Scheduled Function
1. Go to Netlify Dashboard → Functions
2. Check that `sync-from-sheets` is scheduled
3. Wait 15 minutes for first sync
4. Verify new applications synced

## 🔧 Post-Deployment Tasks

### Update Email Logo URL
Once deployed, the logo should be accessible at:
- Production: `https://humdashboard.netlify.app/images/HUMXIII.png`
- Update `EMAIL_LOGO_URL` in Netlify env vars to this URL

### Set Up Custom Domain (Optional)
1. Go to Domain Settings
2. Add custom domain
3. Follow DNS configuration steps

### Monitor Logs
- Netlify Dashboard → Functions → Logs
- Watch for any sync errors
- Monitor email sending failures

## 🚨 Common Issues

### Build Fails
- Check TypeScript errors: `npm run build` locally
- Verify all dependencies in package.json

### Functions Don't Work
- Verify environment variables are set
- Check function logs in Netlify dashboard
- Verify Supabase connection

### Emails Don't Send
- Check SendGrid API key is valid
- Verify EMAIL_FROM is authorized in SendGrid
- Check SendGrid logs

### QR Codes Don't Appear
- Verify logo is accessible at EMAIL_LOGO_URL
- Check SendGrid logs for attachment errors
- Fallback text should display if QR fails

### Sync Doesn't Work
- Verify Google Service Account has sheet access
- Check spreadsheet ID is correct
- Verify private key formatting

## ✅ Success Criteria

Your deployment is successful when:
- ✅ Dashboard loads with all 764 applicants
- ✅ Can view applicant details in modal
- ✅ Pagination works correctly
- ✅ Can accept/waitlist/deny applicants
- ✅ Emails send successfully
- ✅ QR codes generate and attach
- ✅ Check-in scanner works
- ✅ Scheduled sync runs every 15 minutes

## 📞 Support

If issues persist:
1. Check Netlify function logs
2. Verify all environment variables
3. Test locally with `netlify dev`
4. Check Supabase logs
5. Check SendGrid logs

