# 📋 Complete Netlify Deployment Guide

## Prerequisites
- ✅ 778 applicants synced and verified
- ✅ All code builds successfully
- ✅ Environment variables available
- ✅ GitHub repo connected to Netlify

## Step 1: Prepare Your Environment Variables

Before deploying, gather these values:

### From Supabase:
- `SUPABASE_URL`: https://your-project.supabase.co
- `SUPABASE_SERVICE_ROLE_KEY`: Found in Settings → API → service_role key

### From SendGrid:
- `SENDGRID_API_KEY`: Create at https://app.sendgrid.com/settings/api_keys
- `EMAIL_FROM`: Sender email (e.g., `team@hackumass.com`)

### From Google Sheets:
- `GOOGLE_SHEETS_SPREADSHEET_ID`: From URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/...`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: From your service account JSON
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: Full private key with `\n` characters

### Custom Values:
- `ADMIN_API_SECRET`: Your secret token for admin access
- `EMAIL_LOGO_URL`: https://your-site.netlify.app/images/HUMXIII.png (after first deploy)

---

## Step 2: Deploy to Netlify

### Option A: First-Time Deployment (New Site)

1. **Go to Netlify Dashboard**
   - Visit: https://app.netlify.com
   - Log in with GitHub

2. **Import Your Repository**
   - Click "Add new site" → "Import an existing project"
   - Authorize Netlify to access GitHub if needed
   - Select repository: `HUM-Dashboard`

3. **Configure Build Settings**
   - Netlify should auto-detect from `netlify.toml`:
     - Build command: `npm run build`
     - Publish directory: `dist`
     - Functions directory: `netlify/functions`
   - Click "Show advanced"
   - Click "Deploy site"

4. **Wait for Build**
   - Build takes 2-3 minutes
   - Watch the build logs
   - ✅ Build should succeed

5. **Get Your Site URL**
   - After deploy, you'll get: `https://random-name-12345.netlify.app`
   - Note this URL for next steps

### Option B: Re-deploy (Update Existing Site)

1. **Push Changes to GitHub**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Netlify Auto-Deploys**
   - Netlify detects the push
   - Automatically rebuilds and redeploys

---

## Step 3: Configure Environment Variables

**CRITICAL**: This step is required for the app to work!

1. **Go to Site Settings**
   - In Netlify Dashboard, click your site
   - Click "Site settings" (gear icon)
   - Click "Environment variables" in left sidebar

2. **Add Each Variable**

   Click "Add a variable" for each:

   ```
   Key: ADMIN_API_SECRET
   Value: your-secret-token-here
   (Add to: All scopes)
   ```

   ```
   Key: SUPABASE_URL
   Value: https://your-project.supabase.co
   (Add to: All scopes)
   ```

   ```
   Key: SUPABASE_SERVICE_ROLE_KEY
   Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   (Add to: All scopes)
   ```

   ```
   Key: SENDGRID_API_KEY
   Value: SG.xxxxxxxxxxxxxxxxx
   (Add to: All scopes)
   ```

   ```
   Key: EMAIL_FROM
   Value: team@hackumass.com
   (Add to: All scopes)
   ```

   ```
   Key: EMAIL_LOGO_URL
   Value: https://your-site-url.netlify.app/images/HUMXIII.png
   (Add to: All scopes)
   ```

   ```
   Key: GOOGLE_SHEETS_SPREADSHEET_ID
   Value: 1a2b3c4d5e6f7g8h9i0j...
   (Add to: All scopes)
   ```

   ```
   Key: GOOGLE_SERVICE_ACCOUNT_EMAIL
   Value: service-account@your-project.iam.gserviceaccount.com
   (Add to: All scopes)
   ```

   ```
   Key: GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
   Value: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCuSwbiX+X/omaz\n...your full key...\n-----END PRIVATE KEY-----\n"
   (Add to: All scopes)
   ```

3. **Trigger Redeploy**
   - After adding variables, click "Trigger deploy" → "Clear cache and deploy site"

---

## Step 4: Verify Deployment

1. **Visit Your Site**
   - Go to: `https://your-site.netlify.app`
   - You should see "HackUMass Admin" header

2. **Test Dashboard**
   - Click "Dashboard" link
   - Enter your `ADMIN_API_SECRET`
   - Enter your name in "Your Name" field
   - Click "Search"
   - ✅ Should see 778 applicants

3. **Test Pagination**
   - Click "Next" to go to page 2
   - ✅ Should load more applicants

4. **Test Applicant Detail**
   - Click on any applicant row
   - ✅ Modal should show all form responses

5. **Test Email Sending**
   - Click "Accept" on a test applicant
   - Enter optional note
   - Click OK
   - ✅ Check email inbox for acceptance email with QR code

6. **Test Scanner**
   - Click "Scanner" in navigation
   - ✅ Should show camera view
   - Test QR scanning (after accepting someone)

---

## Step 5: Verify Scheduled Function

1. **Check Function Logs**
   - Go to Netlify Dashboard → "Functions"
   - Find `sync-from-sheets`
   - Click "View logs"

2. **Test Manual Sync**
   - Click "Manage scheduled functions"
   - Click "Run now" to test immediately
   - ✅ Should complete successfully

3. **Verify Auto-Sync**
   - Wait 15 minutes
   - Check logs again
   - ✅ Should have run automatically

---

## Step 6: Monitor & Troubleshoot

### Check Build Logs
- Netlify Dashboard → Deploys → Click latest deploy
- Look for any errors or warnings

### Check Function Logs
- Functions → Click function name → View logs
- Look for runtime errors

### Common Issues

**Issue: "Missing environment variables"**
- Fix: Add all required env vars in Settings
- Redeploy: Trigger new deploy

**Issue: "Build failed"**
- Fix: Run `npm run build` locally
- Check TypeScript errors
- Fix and push again

**Issue: "Emails not sending"**
- Fix: Verify SendGrid API key
- Check SendGrid logs
- Verify EMAIL_FROM is authorized

**Issue: "Can't connect to Supabase"**
- Fix: Verify SUPABASE_URL and SERVICE_ROLE_KEY
- Check Supabase dashboard for connection

**Issue: "QR code not showing"**
- Fix: Verify EMAIL_LOGO_URL is correct
- Check logo is accessible
- Fallback text should still display

---

## Step 7: Set Up Custom Domain (Optional)

1. **Go to Domain Settings**
   - Site settings → Domain management
   - Click "Add custom domain"
   - Enter: `humdashboard.netlify.app` or your domain

2. **Configure DNS**
   - Follow Netlify's DNS instructions
   - Add required DNS records
   - Wait for propagation (up to 24 hours)

3. **Update Environment Variables**
   - Update `EMAIL_LOGO_URL` with new domain
   - Trigger redeploy

---

## Step 8: Final Verification Checklist

Before going live, verify:

- [ ] Site loads without errors
- [ ] All 778 applicants display
- [ ] Pagination works
- [ ] Applicant details modal works
- [ ] Can accept/waitlist/deny applicants
- [ ] Emails send successfully
- [ ] QR codes attach to emails
- [ ] QR scanner works
- [ ] Scheduled sync runs every 15 minutes
- [ ] No console errors in browser
- [ ] No build errors in Netlify logs
- [ ] All environment variables set

---

## Quick Reference Commands

### Update Environment Variable
1. Go to Site Settings → Environment Variables
2. Edit variable → Save
3. Trigger deploy

### Force Redeploy
- Deploys → "Trigger deploy" → "Clear cache and deploy site"

### View Logs
- Functions → Click function → "View logs"
- Deploys → Click deploy → View build logs

### Rollback to Previous Version
- Deploys → Click previous deploy → "Publish deploy"

---

## 🎉 Success!

Your HackUMass application management system is now live on Netlify!

**Next Steps:**
1. Share the URL with your team
2. Test with real applicants
3. Monitor logs for any issues
4. Be ready for hackathon day!

**Support Resources:**
- Netlify Docs: https://docs.netlify.com
- Supabase Docs: https://supabase.com/docs
- SendGrid Docs: https://docs.sendgrid.com

