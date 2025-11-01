# Authentication System Explained

## 🔐 Current Authentication Model: **Shared Secret**

### How It Works Now

**Admin Functions:** `list-applicants.ts`, `update-status.ts`
- Require `Authorization: Bearer <ADMIN_API_SECRET>`
- All organizers use the **SAME token**
- Stored in Netlify environment variable
- Token entered once in dashboard, saved in browser localStorage

**Public Functions:** `check-in.ts`, `sync-from-sheets.ts`
- No authentication required
- Anyone can call them

### Current Flow

1. Organizer opens dashboard
2. Enters the shared admin token in the input field
3. Token saved in browser localStorage
4. All API calls include `Authorization: Bearer <token>`
5. Server verifies token matches `ADMIN_API_SECRET`

### Pros ✅
- Simple setup
- No user management
- Works for 5-7 trusted organizers
- Instant deployment

### Cons ⚠️
- All organizers share the same credentials
- Can't track who made which decision
- Can't revoke access for individual organizers
- If token leaks, anyone can access

---

## 🔧 Better Authentication Options

### Option 1: Individual User Accounts (Most Secure)

**Add Supabase Auth:**

```bash
npm install @supabase/auth-helpers-react
```

Create `netlify/functions/_utils/auth.ts`:
```typescript
import { supabaseAdmin } from './supabaseClient';
import type { HandlerEvent } from '@netlify/functions';

export async function requireAuth(event: HandlerEvent): Promise<{ email: string, id: string }> {
  const header = event.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    throw new Error('Unauthorized', { statusCode: 401 });
  }
  
  const token = header.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  
  if (error || !data.user) {
    throw new Error('Invalid token', { statusCode: 401 });
  }
  
  return { email: data.user.email!, id: data.user.id };
}
```

Add login page: `src/pages/Login.tsx`

**Pros:** Individual accounts, audit trail, revoke access
**Cons:** More setup, password reset flow, 30+ minutes work

### Option 2: Magic Links (Passwordless)

Use Supabase Magic Links:
1. Enter email
2. Get magic link sent to email
3. Click link → logged in

**Pros:** No passwords, still individual accounts
**Cons:** Email delivery dependency

### Option 3: Multiple Shared Secrets (Quick Fix)

```typescript
// In auth.ts
const validTokens = [
  process.env.ADMIN_API_SECRET_1,
  process.env.ADMIN_API_SECRET_2,
  process.env.ADMIN_API_SECRET_3,
  // ... up to 7
].filter(Boolean);

export function requireAdmin(event: HandlerEvent): void {
  const header = event.headers['authorization'];
  const token = header?.slice(7);
  
  if (!token || !validTokens.includes(token)) {
    throw new Error('Unauthorized', { statusCode: 401 });
  }
}
```

**Pros:** Quick to implement, individual tokens
**Cons:** Still can't track who did what, manual token management

---

## 📊 Recommended Approach for Your Use Case

**For 5-7 trusted organizers at a hackathon:**

### **Keep Simple Shared Secret** ✅
- Time pressure: You need it working NOW
- Low risk: All organizers are on your team
- Easy deployment: Just set one env var
- Can upgrade later if needed

### **Add Basic Audit Logging** (Optional, 15 min)
Track which organizer made which decision:

```sql
-- Add to schema
create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid references applicants(id),
  action text not null, -- 'accept', 'waitlist', 'deny'
  organizer_email text,
  ip_address text,
  created_at timestamptz default now()
);
```

Then in `update-status.ts`:
```typescript
// After successful update
await supabaseAdmin.from('admin_actions').insert({
  applicant_id: applicantId,
  action: decision,
  organizer_email: app.email, // or extract from somewhere
});
```

---

## 🎯 My Recommendation

**Stick with shared secret for now. Ship it.**

Reasons:
1. 5-7 organizers on the same team
2. One-day hackathon
3. Time is tight
4. Low security risk
5. You can add proper auth later

If you need individual tracking RIGHT NOW:
- Option: Add organizer_email prompt to Dashboard
- Pass it to update-status function
- Log who made each decision

Want me to implement the quick email prompt tracking?

