import { useCallback } from 'react';
import { ActivityBoard, FinalMetr, Leaderboard } from '../components/activity';
import { ConnectionBanner, LangSwitch, Logo, Progress, QR, Timer } from '../components/ui';
import { DURATIONS } from '../content';
import { useI18n } from '../i18n';
import { getQuery, joinUrl } from '../session';
import { useCountdown, useRoom } from '../useRoom';
import { useEffect, useState } from 'react';
import { getBackend } from '../backend';
import { toAppError } from '../backend/types';

/** Projector view – large type, readable from the back of the room. */
export default function Presentation() {
  const { t, err, num } = useI18n();
  const code = (getQuery('room') ?? '').toUpperCase();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState('');

  useEffect(() => {
    if (!code) return;
    getBackend().then((b) => b.findRoom(code)).then(setRoomId)
      .catch((e) => setLookupError(err(toAppError(e).code)));
  }, [code, err]);

  const { state, online, refresh, serverNow } = useRoom({ roomId, pollMs: 2000 });
  const phase = state?.room.phase;
  const idx = state?.room.activityIndex ?? -1;
  const onExpire = useCallback(() => { void refresh(); }, [refresh]);
  const left = useCountdown(phase === 'active' ? state?.room.endsAt : null, serverNow, onExpire);
  const people = state?.participants ?? [];
  const onlineCount = people.filter((p) => p.online).length;
  const url = joinUrl(code);

  return (
    <div className="page screen">
      <ConnectionBanner online={online} />
      <header className="screen-top">
        <Logo size="md" />
        {state && phase !== 'lobby' && phase !== 'final' && <Progress index={idx} phase={phase!} />}
        <div className="screen-meta">
          {phase && phase !== 'lobby' && <span className="pill pill-code">{code}</span>}
          <span className="pill"><i className="dot live" aria-hidden="true" />{num(onlineCount)} {t('connected')}</span>
          <LangSwitch />
        </div>
      </header>

      {lookupError && <p className="error-note big">{lookupError}</p>}

      {state && phase === 'lobby' && (
        <main className="screen-lobby">
          <div className="lobby-left">
            <p className="eyebrow">{t('appName')}</p>
            <h1 className="lobby-title">{t('tagline')}</h1>
            <p className="lobby-join">{t('joinAt')} <b>{url.replace(/^https?:\/\//, '').replace(/\/join.*$/, '/join')}</b></p>
            <p className="lobby-code-label">{t('roomCode')}</p>
            <p className="lobby-code" data-testid="screen-code">{code}</p>
          </div>
          <div className="lobby-right">
            <QR value={url} size={300} />
            <p className="muted">{t('scanToJoin')}</p>
          </div>
          <div className="name-cloud" aria-live="polite">
            {people.map((p) => <span key={p.id} className="name-chip">{p.name}</span>)}
          </div>
        </main>
      )}

      {state && (phase === 'active' || phase === 'reveal') && (
        <main className="screen-stage">
          <div className="screen-side">
            {phase === 'active' ? <Timer left={left} total={DURATIONS[idx]} big /> : <div className="closed-tag">{t('correctAnswer')}</div>}
            <div className="big-count">
              <b data-testid="screen-answered">{num(state.completed[String(idx)] ?? 0)}</b>
              <span>/ {num(people.length)} {t('answered')}</span>
            </div>
          </div>
          <ActivityBoard state={state} big />
        </main>
      )}

      {state && phase === 'results' && (
        <main className="screen-results">
          <h1 className="screen-h">{t('leaderboard')}</h1>
          <Leaderboard state={state} big limit={8} />
        </main>
      )}

      {state && phase === 'final' && <main className="screen-final"><FinalMetr big /></main>}
    </div>
  );
}
