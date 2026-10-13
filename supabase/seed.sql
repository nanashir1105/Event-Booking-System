-- Sample data. Run once after the migration. Dates are relative to today.

insert into public.venues (name, location, capacity) values
  ('Harbour Hall',   'Downtown',  300),
  ('Studio 9',       'Riverside',  60),
  ('Rooftop Garden', 'Uptown',    120);

insert into public.events (venue_id, title, description, starts_at, ends_at, price)
select v.id, e.title, e.description, e.starts_at, e.starts_at + interval '2 hours', e.price
from (values
  ('Studio 9',       'Intro to Pottery', 'Hands-on wheel throwing for beginners. Clay and aprons provided.',
     date_trunc('day', now()) + interval '3 days 10 hours', 25.00),
  ('Harbour Hall',   'Jazz Night',       'A live quartet and an open floor for requests.',
     date_trunc('day', now()) + interval '4 days 19 hours', 15.00),
  ('Rooftop Garden', 'Sunrise Yoga',     'Slow flow with the city waking up below.',
     date_trunc('day', now()) + interval '5 days 6 hours',   0.00),
  ('Studio 9',       'Photography Walk', 'Learn composition and light, then shoot your own set.',
     date_trunc('day', now()) + interval '6 days 14 hours', 20.00)
) as e(venue, title, description, starts_at, price)
join public.venues v on v.name = e.venue;

-- Two one-hour slots per event, 3 seats each (easy to fill up when testing).
insert into public.time_slots (event_id, starts_at, ends_at, capacity)
select e.id,
       e.starts_at + (n * interval '1 hour'),
       e.starts_at + ((n + 1) * interval '1 hour'),
       3
from public.events e, generate_series(0, 1) as n;
