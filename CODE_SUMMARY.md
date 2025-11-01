# HackUMass Dashboard - Complete Code Summary

## ✅ No Errors Found - All Code is Clean

---

## 📂 File Structure & Purpose

### **Configuration Files**

**`package.json`**
- Dependencies: React, Vite, Netlify Functions, Supabase, SendGrid, QRCode, ZXing, etc.
- Scripts: `dev` (Vite), `build` (TypeScript + Vite), `preview`

**`netlify.toml`**
- Build: npm run build → dist folder
- Functions: netlify/functions directory
- Redirects: /api/* → /.netlify/functions/*
- Scheduled: sync-from-sheets runs every 15 minutes via cron

**`vite.config.ts`**
- React plugin for Vite
- Proxy: /api → localhost:8888 (netlify dev)

**`tsconfig.json`**
- TypeScript ESNext, React JSX, strict mode
- Includes: src and netlify/functions

---

### **Database Schema**

**`supabase_schema.sql`**
- Creates `applicants` table with:
  - Basic info (email, name, university, grad year)
  - Status tracking (pending/accepted/waitlisted/denied)
  - QR token for check-in
  - JSONB responses field (stores all Google Form data)
  - Check-in timestamp
  - Updated_at trigger
- Indexes on qr_token and status

---

### **Netlify Functions** (Backend API)

#### **`netlify/functions/_utils/supabaseClient.ts`**
- Creates Supabase admin client (service role key)
- Used by all functions for database access

#### **`netlify/functions/_utils/auth.ts`**
- `requireAdmin()`: checks Authorization Bearer token
- Compares against ADMIN_API_SECRET
- Throws 401/403 if invalid

#### **`netlify/functions/_utils/qr.ts`**
- `generateQrBuffer()`: QR as PNG Buffer
- `generateQrDataUrl()`: base64 data URL
- `generateQrToken()`: 16-char random hex
- Uses `qrcode` with scale 5

#### **`netlify/functions/_utils/email.ts`** ⭐ **Most Complex**
- Uses SendGrid
- `sendDecisionEmail()` sends accept/waitlist/deny emails
- Features:
  - HTML template with logo
  - Text fallback
  - QR attachment for accepted (inline PNG)
  - Status validation (200-299)
  - BCC to admin
  - No tracking
- Template:
  - Black header with logo
  - Decision message
  - QR for accepted
  - Contact info and footer

#### **`netlify/functions/list-applicants.ts`** 🔐 Admin
- GET /list-applicants: paginated search by name/email
- Page/pageSize params, search param
- Returns items + total

#### **`netlify/functions/update-status.ts`** 🔐 Admin
- POST /update-status: set applicant status
- Accept: QR generation + email with QR
- Waitlist/Deny: email only
- Updates DB, sends email, returns success

#### **`netlify/functions/check-in.ts`** 🌐 Public
- POST /check-in: check-in by QR token
- Sets checked_in_at
- Prevents duplicates
- Returns 200/404/409

#### **`netlify/functions/sync-from-sheets.ts`** 🔄 Scheduled
- Syncs Google Sheet → Supabase
- Google Auth JWT
- Maps columns, upserts by email
- Runs every 15 minutes

---

### **Frontend (React)** 

**`src/main.tsx`**
- Sets up React Router and layout
- Routes: / (Dashboard), /scanner (Scanner)

**`src/pages/Dashboard.tsx`**
- Admin applicants table with search and actions
- Auth via localStorage
- Accept/Waitlist/Deny triggers emails

**`src/pages/Scanner.tsx`**
- ZXing QR scanner
- POSTs token to check-in
- Status: Idle/Checking/Checked in
- Pause between scans

---

### **Static Assets**

**`public/images/HUMXIII.png`**
- HackUMass logo for emails

**`index.html`**
- Root HTML with #root
- Loads main.tsx

---

### **Documentation**

**`README.md`**
- Quick setup, env vars, usage, customization

---

## 🔄 **Complete Flow**

### **1. Application Collection**
- Applicants submit via Google Forms → Sheets
- Scheduled job syncs to Supabase
- Organizers view in Dashboard

### **2. Decision Process**
- Organizer accepts/waitlists/denies
- Dashboard calls update-status
- Function:
  - Updates DB
  - Generates QR (accept only)
  - Sends SendGrid email
  - Returns success

### **3. Check-In**
- Attendee shows QR
- Organizer scans via Scanner
- POST check-in with token
- System updates `checked_in_at`
- Prevents duplicates
- Shows status

---

## 🔐 **Security**

- Admin: Bearer token
- Scanner: unauthenticated
- Functions: env var validation
- Supabase: service role for server functions
- SendGrid: API key

---

## 📊 **Database**

- `applicants`: applicants, statuses, QR, check-in, form data
- Email logs: disabled

---

## 🚀 **Deployment**

- Frontend: Vite build → Netlify CDN
- Functions: Netlify serverless
- Database: Supabase
- Email: SendGrid
- Auto-sync: cron every 15 minutes

---

## ✅ **All Systems Working**

- No lint errors
- TypeScript strict mode
- Clear error handling and logging

