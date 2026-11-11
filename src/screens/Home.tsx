import { type FormEvent, useState } from 'react';
import { getBackend } from '../backend';
import { toAppError } from '../backend/types';
import { DemoBanner, ErrorNote, LangSwitch, Logo } from '../components/ui';
import { useI18n } from '../i18n';
import { hostStore, navigate } from '../session';

export default function Home() {
  const { t, err } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');

  const host = async () => {
    setBusy(true);
    setError('');
    try {
      const b = await getBackend();
      const r = await b.createRoom();
      hostStore.save(r.code, r.roomId, r.hostToken);
      navigate(`/host?room=${r.code}`);
    } catch (e) {
      setError(err(toAppError(e).code));
      setBusy(false);
    }
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/join${code.trim() ? `?code=${encodeURIComponent(code.trim().toUpperCase())}` : ''}`);
  };

  return (
    <div className="page home">
      <DemoBanner />
      <div className="home-top"><LangSwitch /></div>
      <main className="home-main">
        <Logo size="xl" />
        <p className="home-name">{t('appName')}</p>
        <p className="home-tag">{t('tagline')}</p>
        <p className="home-intro">{t('homeIntro')}</p>

        <div className="home-cards">
          <form className="card home-card" onSubmit={join}>
            <h2>{t('joinSession')}</h2>
            <p>{t('joinSessionHint')}</p>
            <label className="field">
              <span>{t('roomCode')}</span>
              <input className="code-input" value={code} maxLength={6} autoCapitalize="characters"
                autoComplete="off" inputMode="text" onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </label>
            <button className="btn btn-primary" type="submit">{t('join')}</button>
          </form>

          <div className="card home-card host-card">
            <h2>{t('hostSession')}</h2>
            <p>{t('hostSessionHint')}</p>
            <button className="btn btn-gold" type="button" onClick={host} disabled={busy} data-testid="create-room">
              {busy ? t('creating') : t('hostSession')}
            </button>
          </div>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </main>
    </div>
  );
}
