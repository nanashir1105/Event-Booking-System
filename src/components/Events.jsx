import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { fmtPrice, fmtTime } from '../lib/format.js';
import Seats from './Seats.jsx';

export default function Events({ session, refreshKey, onChanged, onNeedSignIn }) {
  const [events, setEvents] = useState([]);
  const [slotsByEvent, setSlotsByEvent] = useState({});
  const [mine, setMine] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busySlot, setBusySlot] = useState(null);

  const load = useCallback(async () => {
    const now = new Date().toISOString();
    const [ev, sl] = await Promise.all([
      supabase
        .from('events')
        .select('id,title,description,starts_at,ends_at,price,venues(name,location)')
        .gte('ends_at', now)
        .order('starts_at'),
      supabase.from('slot_availability').select('*').gte('ends_at', now).order('starts_at'),
    ]);
    if (ev.error || sl.error) {
      setError((ev.error || sl.error).message);
      setLoading(false);
      return;
    }

    const grouped = {};
    for (const s of sl.data) (grouped[s.event_id] ||= []).push(s);

    let booked = new Set();
    if (session) {
      const { data } = await supabase
        .from('bookings')
        .select('slot_id')
        .eq('user_id', session.user.id)
        .neq('status', 'cancelled');
      booked = new Set((data || []).map((b) => b.slot_id));
    }

    setEvents(ev.data);
    setSlotsByEvent(grouped);
    setMine(booked);
    setError('');
    setLoading(false);
  }, [session]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function book(slot, eventTitle) {
    if (!session) return onNeedSignIn();
    setBusySlot(slot.id);
    setError('');
    setNotice('');
    const { error } = await supabase.rpc('book_slot', { p_slot_id: slot.id });
    setBusySlot(null);
    if (error) setError(error.message);
    else setNotice(`Booked ${eventTitle} at ${fmtTime(slot.starts_at)}.`);
    await load();
    onChanged();
  }

  if (loading) return <p className="empty">Loading events…</p>;

  return (
    <section>
      <h2 className="page-title">Upcoming events</h2>
      {error && <p className="msg error" role="alert">{error}</p>}
      {notice && <p className="msg ok" role="status">{notice}</p>}
      {events.length === 0 && (
        <p className="empty">
          No upcoming events yet. Run <code>supabase/seed.sql</code> or add events from the Admin tab.
        </p>
      )}

      <div className="tickets">
        {events.map((ev) => {
          const start = new Date(ev.starts_at);
          return (
            <article className="ticket" key={ev.id}>
              <div className="ticket-main">
                <h3>{ev.title}</h3>
                <p className="where">
                  {ev.venues?.name}
                  {ev.venues?.location ? `, ${ev.venues.location}` : ''}
                </p>
                {ev.description && <p className="desc">{ev.description}</p>}

                <ul className="slots">
                  {(slotsByEvent[ev.id] || []).map((s) => {
                    const full = s.seats_left <= 0;
                    const has = mine.has(s.id);
                    return (
                      <li key={s.id} className="slot">
                        <div>
                          <strong>
                            {fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}
                          </strong>
                          <Seats capacity={s.capacity} left={s.seats_left} />
                        </div>
                        {has ? (
                          <span className="chip confirmed">Booked</span>
                        ) : (
                          <button
                            className="btn small"
                            disabled={full || busySlot === s.id}
                            onClick={() => book(s, ev.title)}
                          >
                            {full ? 'Full' : session ? 'Book seat' : 'Sign in to book'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                  {(slotsByEvent[ev.id] || []).length === 0 && (
                    <li className="slot muted">No time slots yet</li>
                  )}
                </ul>
              </div>

              <div className="ticket-stub">
                <span className="stub-month">
                  {start.toLocaleDateString([], { month: 'short' })}
                </span>
                <span className="stub-day">{start.getDate()}</span>
                <span className="stub-price">{fmtPrice(ev.price)}</span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
