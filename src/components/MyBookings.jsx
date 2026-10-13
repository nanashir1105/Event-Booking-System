import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { fmtDateTime } from '../lib/format.js';

export default function MyBookings({ session, refreshKey, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id,status,created_at,time_slots(starts_at,ends_at,events(title,venues(name)))')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setRows(data);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function cancel(id) {
    setError('');
    const { error } = await supabase.rpc('cancel_booking', { p_booking_id: id });
    if (error) setError(error.message);
    await load();
    onChanged();
  }

  if (loading) return <p className="empty">Loading your bookings…</p>;

  return (
    <section>
      <h2 className="page-title">My bookings</h2>
      {error && <p className="msg error" role="alert">{error}</p>}
      {rows.length === 0 && <p className="empty">You have no bookings yet. Pick a slot on the Events tab.</p>}

      <ul className="list">
        {rows.map((b) => {
          const slot = b.time_slots;
          const upcoming = slot && new Date(slot.starts_at) > new Date();
          return (
            <li key={b.id} className="row">
              <div>
                <strong>{slot?.events?.title}</strong>
                <span className="muted">
                  {slot?.events?.venues?.name} · {slot && fmtDateTime(slot.starts_at)}
                </span>
              </div>
              <div className="row-actions">
                <span className={`chip ${b.status}`}>{b.status}</span>
                {b.status !== 'cancelled' && upcoming && (
                  <button className="btn small ghost" onClick={() => cancel(b.id)}>
                    Cancel booking
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
