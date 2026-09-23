-- Wander · run this once in Supabase → SQL Editor → New query → Run

create table if not exists public.trips (
  id uuid primary key,
  code text unique not null,
  name text not null,
  destination text not null default '',
  start_date date not null,
  end_date date not null,
  currency text not null default 'INR',
  budget numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  color text not null default '#ff7a59',
  upi_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  amount numeric not null check (amount >= 0),
  category text not null default 'other',
  paid_by uuid not null,
  split_among uuid[] not null default '{}',
  date date not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.plan_items (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  date date not null,
  time text not null default '09:00',
  title text not null,
  note text,
  cost numeric not null default 0,
  category text not null default 'adventure',
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_member uuid not null,
  to_member uuid not null,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid,
  body text not null,
  is_ai boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid,
  path text not null,
  caption text,
  width int,
  height int,
  created_at timestamptz not null default now()
);

create index if not exists members_trip on public.members(trip_id);
create index if not exists expenses_trip on public.expenses(trip_id);
create index if not exists plan_trip on public.plan_items(trip_id);
create index if not exists payments_trip on public.payments(trip_id);
create index if not exists messages_trip on public.messages(trip_id, created_at);
create index if not exists photos_trip on public.photos(trip_id, created_at);

-- Access model: a trip is reachable by anyone who has its (unguessable) invite code.
-- Fine for a friends' trip. For stricter privacy, add Supabase Auth + per-member policies.
do $$
declare t text;
begin
  foreach t in array array['trips','members','expenses','plan_items','payments','messages','photos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "open access" on public.%I', t);
    execute format('create policy "open access" on public.%I for all to anon, authenticated using (true) with check (true)', t);
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;

-- Realtime (live sync between everyone on the trip)
do $$
declare t text;
begin
  foreach t in array array['trips','members','expenses','plan_items','payments','messages','photos'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Photo storage (public bucket, 15 MB per file)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-photos', 'trip-photos', true, 15728640, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

drop policy if exists "trip photos read" on storage.objects;
drop policy if exists "trip photos upload" on storage.objects;
drop policy if exists "trip photos delete" on storage.objects;
create policy "trip photos read" on storage.objects for select to anon, authenticated using (bucket_id = 'trip-photos');
create policy "trip photos upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'trip-photos');
create policy "trip photos delete" on storage.objects for delete to anon, authenticated using (bucket_id = 'trip-photos');

-- ---------- Train tickets + push reminders ----------
create table if not exists public.tickets (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid,
  direction text not null default 'outbound',
  train_name text not null default '',
  train_no text not null default '',
  from_station text not null default '',
  to_station text not null default '',
  depart_at timestamptz not null,
  arrive_at timestamptz,
  pnr text,
  travel_class text,
  passengers jsonb not null default '[]',
  image_path text,
  reminded int[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists tickets_trip on public.tickets(trip_id, depart_at);

create table if not exists public.push_subscriptions (
  id uuid primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_trip on public.push_subscriptions(trip_id);

do $$
declare t text;
begin
  foreach t in array array['tickets','push_subscriptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "open access" on public.%I', t);
    execute format('create policy "open access" on public.%I for all to anon, authenticated using (true) with check (true)', t);
    execute format('alter table public.%I replica identity full', t);
  end loop;
  begin
    alter publication supabase_realtime add table public.tickets;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------- v3: admin & permissions, richer chat, custom split shares ----------
alter table public.trips add column if not exists admin_member_id uuid;
alter table public.trips add column if not exists settings jsonb not null default '{}';
alter table public.members add column if not exists email text;
alter table public.members add column if not exists phone text;
alter table public.messages add column if not exists image_path text;
alter table public.messages add column if not exists kind text not null default 'text';
alter table public.expenses add column if not exists shares jsonb;
