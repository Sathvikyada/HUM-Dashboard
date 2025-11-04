# SendGrid Webhook Setup Guide

This guide will help you set up the SendGrid webhook for your Netlify deployment to track email delivery and engagement events.

## Prerequisites

1. A deployed Netlify site (the webhook needs a public URL)
2. Your Netlify site URL (e.g., `https://your-site-name.netlify.app` or your custom domain)
3. Access to your SendGrid account dashboard

## Step 1: Get Your Webhook URL

Your webhook endpoint will be one of these (both work):

- **Direct path:** `https://your-site-name.netlify.app/.netlify/functions/sendgrid-webhook`
- **Redirect path:** `https://your-site-name.netlify.app/api/sendgrid-webhook`

Replace `your-site-name.netlify.app` with your actual Netlify site URL.

### Finding Your Netlify Site URL

1. Go to your Netlify dashboard: https://app.netlify.com
2. Select your site
3. Your site URL will be shown at the top (e.g., `https://hackumass-dashboard.netlify.app`)

## Step 2: Set Up the Webhook in SendGrid

1. **Log in to SendGrid:** Go to https://app.sendgrid.com and log in with your account

2. **Navigate to Webhooks:**
   - Click on **Settings** (left sidebar)
   - Click on **Mail Settings**
   - Scroll down and click on **Event Webhook**

3. **Configure the Webhook:**
   - **HTTP POST URL:** Enter your webhook URL from Step 1
     ```
     https://your-site-name.netlify.app/api/sendgrid-webhook
     ```
   
4. **Select Events to Track:**
   Enable the following events (at minimum):
   - ✅ **Processed** - Email was received and processed by SendGrid
   - ✅ **Delivered** - Email was successfully delivered to recipient
   - ✅ **Dropped** - Email was dropped (invalid, blacklisted, etc.)
   - ✅ **Deferred** - SendGrid is temporarily delaying delivery
   - ✅ **Bounce** - Email bounced (hard or soft bounce)
   - ✅ **Open** - Recipient opened the email (optional, but useful)
   - ✅ **Click** - Recipient clicked a link (optional, but useful)
   - ✅ **Spam Report** - Recipient marked email as spam
   - ✅ **Unsubscribe** - Recipient unsubscribed

5. **Test the Webhook (Optional):**
   - Click **Test Your Integration**
   - SendGrid will send a test event to your webhook
   - Check your Netlify Function logs to verify it's working

6. **Save the Configuration:**
   - Click **Save** at the bottom

## Step 3: Verify the Webhook is Working

1. **Check Netlify Function Logs:**
   - Go to your Netlify dashboard
   - Navigate to **Functions** → **sendgrid-webhook**
   - Look for recent invocations (you should see requests when emails are sent)

2. **Send a Test Email:**
   - Use your dashboard to accept/deny/waitlist an applicant
   - This will trigger an email through SendGrid
   - The webhook should receive events within a few seconds

3. **Check Email Logs in Your Dashboard:**
   - Go to the **Email Logs** page in your admin dashboard
   - You should see events appear as emails are processed

## Step 4: Verify Environment Variables

Make sure these environment variables are set in Netlify:

1. Go to **Site settings** → **Environment variables**
2. Verify these are set:
   - `SG_API_KEY` - Your SendGrid API key
   - `EMAIL_FROM` - The "from" email address (must be verified in SendGrid)
   - `SUPABASE_URL` - Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key

## Troubleshooting

### Webhook Not Receiving Events

1. **Check the URL is correct:**
   - Make sure you're using your actual Netlify site URL
   - Test the URL in a browser (should return "Method not allowed" for GET, which is expected)

2. **Check Netlify Function Logs:**
   - Look for errors in the function logs
   - Common issues: Database connection errors, missing environment variables

3. **Verify SendGrid Configuration:**
   - Go back to SendGrid → Settings → Mail Settings → Event Webhook
   - Make sure the webhook is **Enabled** (not just saved)
   - Check that events are selected

4. **Test Manually:**
   - You can test the webhook endpoint using curl:
     ```bash
     curl -X POST https://your-site-name.netlify.app/api/sendgrid-webhook \
       -H "Content-Type: application/json" \
       -d '[{"event":"processed","email":"test@example.com","sg_event_id":"test123"}]'
     ```

### Events Not Appearing in Email Logs

1. **Check Database:**
   - Verify the `email_logs` table exists in Supabase
   - Check that the table has the correct schema (see `supabase_email_logs_schema.sql`)

2. **Check Function Logs:**
   - Look for errors when processing events
   - Check if `applicant_id` is being found correctly

3. **Verify Email Matching:**
   - Make sure the email addresses in SendGrid events match those in your `applicants` table
   - Email matching is case-insensitive

## Important Notes

- **Webhook Security:** The current implementation doesn't verify SendGrid webhook signatures. For production, consider adding signature verification for enhanced security.

- **Rate Limits:** SendGrid may throttle webhook events. Your function handles this gracefully, but if you notice missing events, check SendGrid's rate limits.

- **Duplicate Events:** The function uses `sg_event_id` as a unique constraint to prevent duplicate logging. If you see duplicate errors, it means SendGrid is sending duplicate events (which shouldn't happen, but is handled).

## Next Steps

Once the webhook is set up:

1. Monitor the **Email Logs** page regularly to track email delivery
2. Use the logs to identify bounced emails or delivery issues
3. Check for spam reports to adjust your email content if needed

If you need help, check the Netlify Function logs or the SendGrid Event Webhook dashboard for detailed error messages.
