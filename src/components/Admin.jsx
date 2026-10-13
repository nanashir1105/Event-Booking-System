import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { fmtDateTime, toIso } from '../lib/format.js';

const OVERLAP_CODE = '23P01'; // exclusion_violation

function friendly(error) {
  if (error.code === OVERLAP_CODE) return 'That venue already has an event during this time.';
  return error.message;
}

export default function Admin({ refreshKey, onChanged }) {
  const [venues, setVenues] = useState([]);
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const [venue, setVenue] = useState({ name: '', location: '', capacity: 100 });
  const [event, setEvent] = useState({
    venue_id: '', title: '', description: '', starts: '', ends: '', price: 0,
  });
  const [slot, setSlot] = useState({ event_id: '', starts: '', ends: '', capacity: 10 });

  const load = useCallback(async () => {
    const [v, e, b] = await Promise.all([
      supabase.from('venues').select('*').order('name'),
      supabase.from('events').select('id,title,starts_at').order('starts_at', { ascending: false }),
      supabase
        .from('bookings')
        .select('id,status,created_at,profiles(full_name),time_slots(starts_at,events(title))')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    if (v.data) setVenues(v.data);
    if (e.data) setEvents(e.data);
    if (b.data) setBookings(b.data);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function run(promise, okText, reset) {
    const { error } = await promise;
    if (error) return setMsg({ type: 'error', text: friendly(error) });
    setMsg({ type: 'ok', text: okText });
    reset();
    await load();
    onChanged();
  }

  const addVenue = (e) => {
    e.preventDefault();
    run(
      supabase.from('venues').insert({
        name: venue.name,
        location: venue.location,
        capacity: Number(venue.capacity),
      }),
      'Venue added.',
      () => setVenue({ name: '', location: '', capacity: 100 })
    );
  };

  const addEvent = (e) => {
    e.preventDefault();
    run(
      supabase.from('events').insert({
        venue_id: Number(event.venue_id),
        title: event.title,
        description: event.description,
        starts_at: toIso(event.starts),
        ends_at: toIso(event.ends),
        price: Number(event.price),
      }),
      'Event added. Now add time slots for it.',
      () => setEvent({ venue_id: '', title: '', description: '', starts: '', ends: '', price: 0 })
    );
  };

  const addSlot = (e) => {
    e.preventDefault();
    run(
      supabase.from('time_slots').insert({
        event_id: Number(slot.event_id),
        starts_at: toIso(slot.starts),
        ends_at: toIso(slot.ends),
        capacity: Number(slot.capacity),
      }),
      'Time slot added.',
      () => setSlot({ event_id: '', starts: '', ends: '', capacity: 10 })
    );
  };

  return (
    <section>
      <h2 className="page-title">Admin</h2>
      {msg.text && (
        <p className={`msg ${msg.type}`} role={msg.type === 'error' ? 'alert' : 'status'}>
          {msg.text}
        </p>
      )}

      <div className="admin-grid">
        <form className="panel form" onSubmit={addVenue}>
          <h3>New venue</h3>
          <label>Name<input required value={venue.name} onChange={(e) => setVenue({ ...venue, name: e.target.value })} /></label>
          <label>Location<input value={venue.location} onChange={(e) => setVenue({ ...venue, location: e.target.value })} /></label>
          <label>Capacity<input type="number" min="1" required value={venue.capacity} onChange={(e) => setVenue({ ...venue, capacity: e.target.value })} /></label>
          <button className="btn">Add venue</button>
        </form>

        <form className="panel form" onSubmit={addEvent}>
          <h3>New event</h3>
          <label>
            Venue
            <select required value={event.venue_id} onChange={(e) => setEvent({ ...event, venue_id: e.target.value })}>
              <option value="">Choose a venue</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <label>Title<input required value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} /></label>
          <label>Description<input value={event.description} onChange={(e) => setEvent({ ...event, description: e.target.value })} /></label>
          <label>Starts<input type="datetime-local" required value={event.starts} onChange={(e) => setEvent({ ...event, starts: e.target.value })} /></label>
          <label>Ends<input type="datetime-local" required value={event.ends} onChange={(e) => setEvent({ ...event, ends: e.target.value })} /></label>
          <label>Price<input type="number" min="0" step="0.01" value={event.price} onChange={(e) => setEvent({ ...event, price: e.target.value })} /></label>
          <button className="btn">Add event</button>
        </form>

        <form className="panel form" onSubmit={addSlot}>
          <h3>New time slot</h3>
          <label>
            Event
            <select required value={slot.event_id} onChange={(e) => setSlot({ ...slot, event_id: e.target.value })}>
              <option value="">Choose an event</option>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title} ({fmtDateTime(ev.starts_at)})</option>)}
            </select>
          </label>
          <label>Starts<input type="datetime-local" required value={slot.starts} onChange={(e) => setSlot({ ...slot, starts: e.target.value })} /></label>
          <label>Ends<input type="datetime-local" required value={slot.ends} onChange={(e) => setSlot({ ...slot, ends: e.target.value })} /></label>
          <label>Seats<input type="number" min="1" required value={slot.capacity} onChange={(e) => setSlot({ ...slot, capacity: e.target.value })} /></label>
          <button className="btn">Add time slot</button>
        </form>
      </div>

      <h3 className="sub-title">Latest bookings</h3>
      {bookings.length === 0 && <p className="empty">No bookings yet.</p>}
      <ul className="list">
        {bookings.map((b) => (
          <li key={b.id} className="row">
            <div>
              <strong>{b.profiles?.full_name || 'Unknown'}</strong>
              <span className="muted">
                {b.time_slots?.events?.title} · {b.time_slots && fmtDateTime(b.time_slots.starts_at)}
              </span>
            </div>
            <span className={`chip ${b.status}`}>{b.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
