-- ==========================================
-- Email Logs Schema for SendGrid Webhook
-- Run this in Supabase SQL Editor
-- ==========================================

-- Email logs table
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- processed | delivered | dropped | deferred | bounce | open | click | spam_report | unsubscribe
  applicant_id UUID REFERENCES public.applicants(id) ON DELETE CASCADE,
  applicant_email TEXT NOT NULL,
  subject TEXT,
  sg_message_id TEXT,
  sg_event_id TEXT UNIQUE,
  reason TEXT, -- failure reason, spam reason, etc.
  raw_event JSONB, -- full webhook payload
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_email_logs_applicant_id ON public.email_logs(applicant_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_email ON public.email_logs(applicant_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_event_type ON public.email_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_sg_event_id ON public.email_logs(sg_event_id);

-- ==========================================
-- Event Type Descriptions
-- ==========================================
-- processed: Email was received and processed by SendGrid
-- delivered: Email was successfully delivered to the recipient
-- dropped: Email was dropped by SendGrid (invalid, blacklisted, etc.)
-- deferred: SendGrid is temporarily delaying delivery
-- bounce: Email bounced (hard bounce = permanent, soft bounce = temporary)
-- open: Recipient opened the email
-- click: Recipient clicked a link in the email
-- spam_report: Recipient marked email as spam
-- unsubscribe: Recipient clicked unsubscribe link

