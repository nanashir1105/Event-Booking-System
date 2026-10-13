import { useEffect, useState } from 'react';
import { configured, supabase } from './lib/supabase.js';
import AuthForm from './components/AuthForm.jsx';
import Events from './components/Events.jsx';
import MyBookings from './components/MyBookings.jsx';
import Admin from './components/Admin.jsx';

function SetupNotice() {
  return (
    <main className="shell">
      <section className="panel narrow">
        <h2>Connect Supabase</h2>
        <p>
          Copy <code>.env.example</code> to <code>.env</code>, paste your project URL and anon key,
          then restart <code>npm run dev</code>.
        </p>
      </section>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('events');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    supabase
      .from('profiles')
      .select('full_name,role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile(data));
  }, [session]);

  if (!configured) return <SetupNotice />;
  if (!ready) return null;

  const isAdmin = profile?.role === 'admin';
  const bump = () => setRefreshKey((k) => k + 1);

  // Fall back to Events if the current tab is no longer allowed (e.g. after sign out).
  const current =
    (tab === 'mine' && !session) || (tab === 'admin' && !isAdmin) || (tab === 'auth' && session)
      ? 'events'
      : tab;

  async function signOut() {
    await supabase.auth.signOut();
    setTab('events');
  }

  return (
    <>
      <header className="top">
        <div className="top-inner">
          <h1 className="brand">Stubs</h1>
          <nav aria-label="Main">
            <button className={current === 'events' ? 'tab on' : 'tab'} onClick={() => setTab('events')}>
              Events
            </button>
            {session && (
              <button className={current === 'mine' ? 'tab on' : 'tab'} onClick={() => setTab('mine')}>
                My bookings
              </button>
            )}
            {isAdmin && (
              <button className={current === 'admin' ? 'tab on' : 'tab'} onClick={() => setTab('admin')}>
                Admin
              </button>
            )}
          </nav>
          <div className="who">
            {session ? (
              <>
                <span>{profile?.full_name || session.user.email}</span>
                <button className="btn small ghost" onClick={signOut}>Sign out</button>
              </>
            ) : (
              <button className="btn small" onClick={() => setTab('auth')}>Sign in</button>
            )}
          </div>
        </div>
      </header>

      <main className="shell">
        {current === 'events' && (
          <Events
            session={session}
            refreshKey={refreshKey}
            onChanged={bump}
            onNeedSignIn={() => setTab('auth')}
          />
        )}
        {current === 'mine' && <MyBookings session={session} refreshKey={refreshKey} onChanged={bump} />}
        {current === 'admin' && <Admin refreshKey={refreshKey} onChanged={bump} />}
        {current === 'auth' && <AuthForm onDone={() => setTab('events')} />}
      </main>
    </>
  );
}
