import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function AuthForm({ onDone }) {
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');

    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: name } },
          });

    setBusy(false);
    if (error) return setError(error.message);
    if (mode === 'signup' && !data.session) {
      return setNotice('Check your inbox to confirm your email, then sign in.');
    }
    onDone();
  }

  return (
    <section className="panel narrow">
      <h2>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h2>
      <form onSubmit={submit} className="form">
        {mode === 'signup' && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            minLength={6}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="msg error" role="alert">{error}</p>}
        {notice && <p className="msg ok">{notice}</p>}
        <button className="btn" disabled={busy}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="switch">
        {mode === 'signin' ? 'New here?' : 'Already have an account?'}{' '}
        <button className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
    </section>
  );
}
