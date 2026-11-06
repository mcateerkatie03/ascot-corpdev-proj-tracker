-- Ascot Corp Dev project tracker: schema, logins and row-level security.
-- Run once in the Supabase SQL editor on a new project.
--
-- There are no roles: every signed-in login with a profile can read and edit.
-- Anonymous visitors get nothing. Logins are created by scripts/logins.mjs (secret key), never from the browser.

-- ---------- logins ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9._-]{2,40}$'),
  display_name text not null,
  initials     text not null default '' check (length(initials) <= 6),   -- matches the "Corp Dev" column, e.g. WL
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles: signed-in read" on public.profiles;
create policy "profiles: signed-in read" on public.profiles
  for select to authenticated using (true);
-- No insert/update/delete policies: only the logins script changes profiles.

-- True when the caller is a signed-in login with a profile.
create or replace function public.is_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid())
$$;
revoke all on function public.is_member() from public;
grant execute on function public.is_member() to authenticated;

-- ---------- tracker records ----------
-- projects: one row per project (current and archived)
-- todos:    weekly to-do steps, usually from a meeting transcript
-- meetings: one row per weekly meeting, with a snapshot of the project list (like the dated tabs in the workbook)
-- Each record is a JSON document so fields can change without migrations.
do $$
declare t text;
begin
  foreach t in array array['projects', 'todos', 'meetings'] loop
    execute format($f$
      create table if not exists public.%1$I (
        id         text primary key check (length(id) between 1 and 64),
        doc        jsonb not null check (jsonb_typeof(doc) = 'object' and pg_column_size(doc) < 1048576),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        updated_by uuid default auth.uid()
      );
      alter table public.%1$I enable row level security;

      drop policy if exists "read: members" on public.%1$I;
      create policy "read: members" on public.%1$I for select to authenticated using (public.is_member());
      drop policy if exists "insert: members" on public.%1$I;
      create policy "insert: members" on public.%1$I for insert to authenticated with check (public.is_member());
      drop policy if exists "update: members" on public.%1$I;
      create policy "update: members" on public.%1$I for update to authenticated using (public.is_member()) with check (public.is_member());
      drop policy if exists "delete: members" on public.%1$I;
      create policy "delete: members" on public.%1$I for delete to authenticated using (public.is_member());
    $f$, t);
  end loop;
end $$;

-- Shared settings (one JSON document per key), e.g. whether Claude may file categories automatically.
create table if not exists public.settings (
  id         text primary key check (length(id) between 1 and 64),
  doc        jsonb not null check (jsonb_typeof(doc) = 'object' and pg_column_size(doc) < 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.settings enable row level security;
drop policy if exists "read: members" on public.settings;
create policy "read: members" on public.settings for select to authenticated using (public.is_member());
drop policy if exists "insert: members" on public.settings;
create policy "insert: members" on public.settings for insert to authenticated with check (public.is_member());
drop policy if exists "update: members" on public.settings;
create policy "update: members" on public.settings for update to authenticated using (public.is_member()) with check (public.is_member());

-- Stamp who changed what, server side.
create or replace function public.stamp_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists stamp_projects on public.projects;
create trigger stamp_projects before insert or update on public.projects for each row execute function public.stamp_update();
drop trigger if exists stamp_todos on public.todos;
create trigger stamp_todos before insert or update on public.todos for each row execute function public.stamp_update();
drop trigger if exists stamp_meetings on public.meetings;
create trigger stamp_meetings before insert or update on public.meetings for each row execute function public.stamp_update();
drop trigger if exists stamp_settings on public.settings;
create trigger stamp_settings before insert or update on public.settings for each row execute function public.stamp_update();

-- ---------- change history ----------
-- Who changed which project or to-do field, from what, to what, and when. Written only by the trigger.
create table if not exists public.history (
  id          bigint generated always as identity primary key,
  tbl         text not null check (tbl in ('projects', 'todos')),
  record_id   text not null,
  op          text not null check (op in ('insert', 'update', 'delete')),
  changes     jsonb not null default '{}'::jsonb,   -- update: {"field": {"from": .., "to": ..}}; insert/delete: {"doc": ..}
  changed_at  timestamptz not null default now(),
  changed_by  uuid
);
create index if not exists history_record on public.history (tbl, record_id, changed_at desc);
create index if not exists history_time on public.history (changed_at desc);
alter table public.history enable row level security;
drop policy if exists "history: members read" on public.history;
create policy "history: members read" on public.history for select to authenticated using (public.is_member());

create or replace function public.log_change()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  d jsonb := '{}'::jsonb;
  k text;
begin
  if tg_op = 'INSERT' then
    insert into public.history (tbl, record_id, op, changes, changed_by)
    values (tg_table_name, new.id, 'insert', jsonb_build_object('doc', new.doc), auth.uid());
  elsif tg_op = 'DELETE' then
    insert into public.history (tbl, record_id, op, changes, changed_by)
    values (tg_table_name, old.id, 'delete', jsonb_build_object('doc', old.doc), auth.uid());
  else
    for k in select jsonb_object_keys(coalesce(old.doc, '{}'::jsonb) || coalesce(new.doc, '{}'::jsonb)) loop
      continue when k in ('updatedAt', 'updatedBy', 'updatedByName');   -- bookkeeping, not edits
      if (old.doc -> k) is distinct from (new.doc -> k) then
        d := d || jsonb_build_object(k, jsonb_build_object('from', old.doc -> k, 'to', new.doc -> k));
      end if;
    end loop;
    if d <> '{}'::jsonb then
      insert into public.history (tbl, record_id, op, changes, changed_by)
      values (tg_table_name, new.id, 'update', d, auth.uid());
    end if;
  end if;
  return null;
end $$;
revoke all on function public.log_change() from public;

drop trigger if exists history_projects on public.projects;
create trigger history_projects after insert or update or delete on public.projects for each row execute function public.log_change();
drop trigger if exists history_todos on public.todos;
create trigger history_todos after insert or update or delete on public.todos for each row execute function public.log_change();

-- Anonymous visitors get nothing.
revoke all on public.projects, public.todos, public.meetings, public.settings, public.history, public.profiles from anon;

-- Live updates in the browser (realtime respects the policies above).
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.projects'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.todos';    exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.meetings'; exception when duplicate_object then null; end;
end $$;
