-- Event booking system: schema, integrity rules, RLS, and booking functions.
-- Run once in the Supabase SQL Editor (or via `supabase db push`).

create extension if not exists btree_gist;

-- ---------- Types ----------
create type public.booking_status as enum ('pending', 'confirmed', 'cancelled');

-- ---------- Tables ----------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

create table public.venues (
  id       bigint generated always as identity primary key,
  name     text not null,
  location text not null default '',
  capacity int  not null check (capacity > 0)
);

create table public.events (
  id          bigint generated always as identity primary key,
  venue_id    bigint not null references public.venues (id) on delete restrict,
  title       text not null,
  description text not null default '',
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  price       numeric(10, 2) not null default 0 check (price >= 0),
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at),
  -- No two events may overlap in the same venue.
  constraint events_no_venue_overlap
    exclude using gist (venue_id with =, tstzrange(starts_at, ends_at) with &&)
);

create table public.time_slots (
  id        bigint generated always as identity primary key,
  event_id  bigint not null references public.events (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  capacity  int not null check (capacity > 0),
  check (ends_at > starts_at)
);

create table public.bookings (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  slot_id    bigint not null references public.time_slots (id) on delete cascade,
  status     public.booking_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- A user can hold only one active booking per slot.
create unique index bookings_one_active_per_user_slot
  on public.bookings (user_id, slot_id)
  where status <> 'cancelled';

create index bookings_slot_idx on public.bookings (slot_id);
create index time_slots_event_idx on public.time_slots (event_id);

-- ---------- Profile auto-creation ----------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Helpers ----------
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- Status flow: pending -> confirmed -> cancelled ----------
create function public.enforce_booking_status()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'A cancelled booking cannot be reopened';
  end if;
  if old.status = 'confirmed' and new.status = 'pending' then
    raise exception 'A confirmed booking cannot go back to pending';
  end if;
  return new;
end;
$$;

create trigger bookings_status_flow
  before update of status on public.bookings
  for each row execute function public.enforce_booking_status();

-- ---------- Availability view ----------
-- Runs with owner rights on purpose: everyone can see seats left,
-- but nobody can see other people's bookings.
create view public.slot_availability as
select
  s.id,
  s.event_id,
  s.starts_at,
  s.ends_at,
  s.capacity,
  s.capacity - count(b.id) filter (where b.status <> 'cancelled') as seats_left
from public.time_slots s
left join public.bookings b on b.slot_id = s.id
group by s.id;

grant select on public.slot_availability to anon, authenticated;

-- ---------- Booking functions ----------
-- Locks the slot row so two people can't take the last seat at once.
create function public.book_slot(p_slot_id bigint)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot    public.time_slots;
  v_taken   int;
  v_booking public.bookings;
begin
  if auth.uid() is null then
    raise exception 'Sign in to book a slot';
  end if;

  select * into v_slot from public.time_slots where id = p_slot_id for update;
  if not found then
    raise exception 'Slot not found';
  end if;
  if v_slot.starts_at <= now() then
    raise exception 'This slot has already started';
  end if;

  if exists (
    select 1 from public.bookings
    where slot_id = p_slot_id and user_id = auth.uid() and status <> 'cancelled'
  ) then
    raise exception 'You have already booked this slot';
  end if;

  select count(*) into v_taken
  from public.bookings
  where slot_id = p_slot_id and status <> 'cancelled';

  if v_taken >= v_slot.capacity then
    raise exception 'This slot is full';
  end if;

  insert into public.bookings (user_id, slot_id, status)
  values (auth.uid(), p_slot_id, 'confirmed')
  returning * into v_booking;

  return v_booking;
end;
$$;

create function public.cancel_booking(p_booking_id bigint)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_start   timestamptz;
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id and b.user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;
  if v_booking.status = 'cancelled' then
    raise exception 'This booking is already cancelled';
  end if;

  select starts_at into v_start from public.time_slots where id = v_booking.slot_id;
  if v_start <= now() then
    raise exception 'You cannot cancel a slot that has already started';
  end if;

  update public.bookings set status = 'cancelled'
  where id = p_booking_id
  returning * into v_booking;

  return v_booking;
end;
$$;

revoke execute on function public.book_slot(bigint)      from public, anon;
revoke execute on function public.cancel_booking(bigint) from public, anon;
grant  execute on function public.book_slot(bigint)      to authenticated;
grant  execute on function public.cancel_booking(bigint) to authenticated;

-- ---------- Row Level Security ----------
alter table public.profiles   enable row level security;
alter table public.venues     enable row level security;
alter table public.events     enable row level security;
alter table public.time_slots enable row level security;
alter table public.bookings   enable row level security;

-- profiles: read your own (admins read all); edit only your name, never your role.
create policy "profiles: read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles: update own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant  update (full_name) on public.profiles to authenticated;

-- venues / events / time_slots: public read, admin write.
create policy "venues: public read" on public.venues
  for select using (true);
create policy "venues: admin write" on public.venues
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "events: public read" on public.events
  for select using (true);
create policy "events: admin write" on public.events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "time_slots: public read" on public.time_slots
  for select using (true);
create policy "time_slots: admin write" on public.time_slots
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- bookings: read your own (admins read all). Changes go through book_slot / cancel_booking only.
create policy "bookings: read own or admin" on public.bookings
  for select using (user_id = auth.uid() or public.is_admin());
