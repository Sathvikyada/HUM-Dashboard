-- Applicants table
create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  university text,
  graduation_year text,
  responses jsonb not null default '{}'::jsonb,
  status text not null default 'pending', -- pending | accepted | waitlisted | denied
  decision_note text,
  qr_token text unique, -- populated when accepted
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Lightweight unique token for QR (indexed)
create index if not exists idx_applicants_qr_token on public.applicants(qr_token);
create index if not exists idx_applicants_status on public.applicants(status);

-- Trigger to update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_updated_at on public.applicants;
create trigger trg_set_updated_at
before update on public.applicants
for each row execute function public.set_updated_at();

