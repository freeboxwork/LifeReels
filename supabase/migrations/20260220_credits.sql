-- Credits tables and atomic credit mutation function

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  job_id text null,
  external_ref text null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_ledger_user_created
  on public.credit_ledger(user_id, created_at desc);

alter table public.user_credits enable row level security;
alter table public.credit_ledger enable row level security;

-- Users can read only their own balances / ledger rows (optional but useful for future UI).
drop policy if exists "user_credits_select_own" on public.user_credits;
create policy "user_credits_select_own"
on public.user_credits
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "credit_ledger_select_own" on public.credit_ledger;
create policy "credit_ledger_select_own"
on public.credit_ledger
for select
to authenticated
using (auth.uid() = user_id);

-- No direct insert/update/delete from normal users.
drop policy if exists "user_credits_no_write" on public.user_credits;
create policy "user_credits_no_write"
on public.user_credits
for all
to authenticated
using (false)
with check (false);

drop policy if exists "credit_ledger_no_write" on public.credit_ledger;
create policy "credit_ledger_no_write"
on public.credit_ledger
for all
to authenticated
using (false)
with check (false);

create or replace function public.apply_credit_delta(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_job_id text default null,
  p_external_ref text default null
)
returns table(applied boolean, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_next integer;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- Per-user transaction lock to avoid race conditions.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_external_ref is not null then
    if exists (select 1 from public.credit_ledger where external_ref = p_external_ref) then
      insert into public.user_credits (user_id, balance)
      values (p_user_id, 0)
      on conflict (user_id) do nothing;

      select uc.balance into v_current
      from public.user_credits uc
      where uc.user_id = p_user_id;

      return query select false, coalesce(v_current, 0);
      return;
    end if;
  end if;

  insert into public.user_credits (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select uc.balance into v_current
  from public.user_credits uc
  where uc.user_id = p_user_id
  for update;

  v_next := coalesce(v_current, 0) + coalesce(p_delta, 0);
  if v_next < 0 then
    return query select false, coalesce(v_current, 0);
    return;
  end if;

  update public.user_credits
  set balance = v_next, updated_at = now()
  where user_id = p_user_id;

  insert into public.credit_ledger(user_id, delta, reason, job_id, external_ref)
  values (p_user_id, coalesce(p_delta, 0), coalesce(p_reason, 'adjust'), p_job_id, p_external_ref);

  return query select true, v_next;
end;
$$;

revoke all on function public.apply_credit_delta(uuid, integer, text, text, text) from public;
grant execute on function public.apply_credit_delta(uuid, integer, text, text, text) to service_role;

