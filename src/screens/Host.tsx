import { useCallback, useState } from 'react';
import { type HostAction, toAppError } from '../backend/types';
import { ActivityBoard, FinalMetr, Leaderboard } from '../components/activity';
import { ConnectionBanner, DemoBanner, ErrorNote, Progress, QR, Timer, TopBar } from '../components/ui';
import { DURATIONS } from '../content';
import { useI18n } from '../i18n';
import { getQuery, hostStore, joinUrl, navigate } from '../session';
import { useCountdown, useRoom } from '../useRoom';

export default function Host() {
  const { t, err, num } = useI18n();
  const code = (getQuery('room') ?? '').toUpperCase();
  const creds = hostStore.load(code);
  const { state, setState, online, backend, refresh, notify, serverNow } = useRoom({ roomId: creds?.roomId ?? null, pollMs: 2500 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const phase = state?.room.phase;
  const idx = state?.room.activityIndex ?? -1;
  const onExpire = useCallback(() => { void refresh().then(notify); }, [refresh, notify]);
  const left = useCountdown(phase === 'active' ? state?.room.endsAt : null, serverNow, onExpire);

  if (!creds) {
    return (
      <div className="page center-page">
        <TopBar />
        <div className="card narrow">
          <p>{t('hostNotFound')}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>{t('backHome')}</button>
        </div>
      </div>
    );
  }

  const act = async (a: HostAction) => {
    if (!backend) return;
    if (a === 'restart' && !window.confirm(t('restartConfirm'))) return;
    setBusy(true);
    setError('');
    try {
      const s = await backend.hostAction(creds.roomId, creds.token, a);
      setState(s);
      notify();
    } catch (e) {
      setError(err(toAppError(e).code));
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const url = joinUrl(code);
  const people = state?.participants ?? [];
  const onlineCount = people.filter((p) => p.online).length;
  const done = state?.completed[String(idx)] ?? 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  let primary: { label: string; action: HostAction } | null = null;
  if (phase === 'lobby') primary = { label: t('startExperience'), action: 'start' };
  else if (phase === 'active') primary = { label: t('endActivity'), action: 'close' };
  else if (phase === 'reveal') primary = idx < 3 ? { label: t('nextActivity'), action: 'next' } : { label: t('showResults'), action: 'next' };
  else if (phase === 'results') primary = { label: t('showFinal'), action: 'final' };

  return (
    <div className="page host">
      <DemoBanner />
      <ConnectionBanner online={online} />
      <TopBar>
        <span className="pill">{t('hostPanel')}</span>
        <span className="pill pill-code" data-testid="room-code">{code}</span>
      </TopBar>

      <div className="host-grid">
        <aside className="host-side">
          <div className="card join-card">
            <QR value={url} size={180} />
            <p className="join-code">{code}</p>
            <p className="join-url">{url.replace(/^https?:\/\//, '')}</p>
            <div className="row">
              <button className="btn btn-ghost btn-sm" onClick={copy}>{copied ? t('copied') : t('copyLink')}</button>
              <a className="btn btn-ghost btn-sm" href={`/screen?room=${code}`} target="_blank" rel="noopener">{t('openPresentation')}</a>
            </div>
          </div>

          <div className="card people-card">
            <div className="people-head">
              <h3>{t('participants')}</h3>
              <span className="count" data-testid="participant-count">{num(onlineCount)} {t('connected')} · {num(people.length)}</span>
            </div>
            {people.length === 0 ? <p className="muted">{t('noParticipants')}</p> : (
              <ul className="people">
                {people.map((p) => (
                  <li key={p.id} className={p.online ? 'on' : 'off'}>
                    <i className="dot" aria-hidden="true" />{p.name}<small>{p.lang.toUpperCase()}</small>
                  </li>
                ))}
              </ul>
            )}
            {phase === 'lobby' && people.some((p) => !p.online) && (
              <button className="btn btn-ghost btn-sm" onClick={() => act('remove_offline')}>{t('removeOffline')}</button>
            )}
          </div>
        </aside>

        <main className="host-main">
          {state && (
            <>
              <div className="host-controls card">
                <Progress index={idx} phase={phase ?? 'lobby'} />
                <div className="controls-row">
                  {phase === 'active' && <Timer left={left} total={DURATIONS[idx]} />}
                  {(phase === 'active' || phase === 'reveal') && (
                    <div className="answered-count" data-testid="answered">
                      <b>{num(done)}</b> / {num(people.length)} <span>{t('answered')}</span>
                    </div>
                  )}
                  <div className="spacer" />
                  {primary && (
                    <button className="btn btn-gold btn-lg" disabled={busy || (phase === 'lobby' && people.length === 0)}
                      onClick={() => act(primary!.action)} data-testid="primary">
                      {primary.label}
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => act('restart')} disabled={busy || phase === 'lobby'}>{t('restart')}</button>
                </div>
                <ErrorNote>{error}</ErrorNote>
              </div>

              <div className="card host-stage">
                {phase === 'lobby' && (
                  <div className="lobby-host">
                    <h1>{t('appName')}</h1>
                    <p className="muted">{t('tagline')}</p>
                  </div>
                )}
                {(phase === 'active' || phase === 'reveal') && <ActivityBoard state={state} />}
                {phase === 'results' && <Leaderboard state={state} />}
                {phase === 'final' && <FinalMetr />}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
