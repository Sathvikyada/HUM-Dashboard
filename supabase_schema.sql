-- ==========================================
-- HackUMass Applicants Schema
-- Run this in Supabase SQL Editor
-- ==========================================

-- Main applicants table
CREATE TABLE IF NOT EXISTS public.applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  university TEXT,
  graduation_year TEXT,
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  decision_note TEXT,
  decided_by TEXT,
  qr_token TEXT UNIQUE,
  checked_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_applicants_qr_token ON public.applicants(qr_token);
CREATE INDEX IF NOT EXISTS idx_applicants_status ON public.applicants(status);
CREATE INDEX IF NOT EXISTS idx_applicants_email ON public.applicants(email);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.applicants;
CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.applicants
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================
-- Column Descriptions
-- ==========================================
-- id: Unique identifier for each applicant
-- email: Unique email address (from Google Form)
-- full_name: Combined "First Name" + "Last Name" or "Full Name" from form
-- university: University/College name
-- graduation_year: Graduation year (as text to handle variations)
-- responses: ALL other form fields stored as JSON (flexible, no schema changes needed)
-- status: pending | accepted | waitlisted | denied
-- decision_note: Optional note when making decision
-- decided_by: Organizer name who made the decision (for audit trail)
-- qr_token: Unique token generated when accepted (for QR code check-in)
-- checked_in_at: Timestamp when QR was scanned at event
-- created_at: When applicant first synced
-- updated_at: Auto-updated when any field changes

