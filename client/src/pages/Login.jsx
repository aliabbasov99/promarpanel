import { useState } from 'react';
import { useAuth } from '../auth';
import { LuHeadset, LuLogIn } from 'react-icons/lu';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">
          <LuHeadset size={30} />
          <h1>PROMAR</h1>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="field">
          <label>İstifadəçi adı</label>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
            autoComplete="username"
          />
        </div>

        <div className="field">
          <label>Parol</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••"
            autoComplete="current-password"
          />
        </div>

        <button className="btn" type="submit" disabled={busy}>
          <LuLogIn size={16} /> {busy ? 'Daxil olunur…' : 'Daxil ol'}
        </button>
      </form>
    </div>
  );
}