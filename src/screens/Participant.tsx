import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { getBackend } from '../backend';
import { type Lang, type ParticipantSession, type RoomState, toAppError } from '../backend/types';
import { Badges, DEFAULT_WHATIF, FinalMetr, Leaderboard, ScatterVisual, type WhatIfValue, WhatIfSim } from '../components/activity';
import { Confetti, ConnectionBanner, DemoBanner, ErrorNote, Progress, Timer, TopBar } from '../components/ui';
import { ACTIVITIES, DURATIONS, SAFE_NOTE, questionIdsOf } from '../content';
import { useI18n } from '../i18n';
import { getQuery, participantStore } from '../session';
import { useCountdown, useRoom } from '../useRoom';

export default function Participant() {
  const [code, setCode] = useState((getQuery('code') ?? '').toUpperCase());
  const [session, setSession] = useState<ParticipantSession | null>(() => (code ? participantStore.load(code) : null));

  if (!session) {
    return <JoinForm initialCode={code} onJoined={(c, s) => { setCode(c); setSession(s); }} />;
  }
  return <Live code={code} session={session} onLost={() => { participantStore.clear(code); setSession(null); }} />;
}

function JoinForm({ initialCode, onJoined }: { initialCode: string; onJoined: (code: string, s: ParticipantSession) => void }) {
  const { t, err, lang, setLang } = useI18n();
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const b = await getBackend();
      const c = code.trim().toUpperCase();
      const s = await b.joinRoom(c, name, lang);
      participantStore.save(c, s);
      window.history.replaceState({}, '', `/join?code=${c}`);
      b.notify(s.roomId);
      onJoined(c, s);
    } catch (ex) {
      setError(err(toAppError(ex).code));
      setBusy(false);
    }
  };

  return (
    <div className="page participant">
      <DemoBanner />
      <TopBar />
      <main className="p-main">
        <form className="card join-form" onSubmit={submit}>
          <h1>{t('joinSession')}</h1>
          <label className="field">
            <span>{t('roomCode')}</span>
            <input className="code-input" name="code" value={code} maxLength={6} required autoComplete="off"
              autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </label>
          <label className="field">
            <span>{t('nickname')}</span>
            <input name="name" value={name} maxLength={24} required placeholder={t('nicknamePh')} autoComplete="nickname"
              onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="field">
            <span>{t('chooseLanguage')}</span>
            <div className="seg">
              {(['ar', 'en'] as Lang[]).map((l) => (
                <button type="button" key={l} lang={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
                  {l === 'ar' ? 'العربية' : 'English'}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !name.trim() || code.trim().length < 4}>
            {busy ? t('joining') : t('join')}
          </button>
          <ErrorNote>{error}</ErrorNote>
        </form>
      </main>
    </div>
  );
}

function Live({ code, session, onLost }: { code: string; session: ParticipantSession; onLost: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { state, error, online, backend, refresh, notify, serverNow } = useRoom({ roomId: session.roomId, session, pollMs: 3000 });

  useEffect(() => { if (error?.code === 'SESSION_INVALID' || error?.code === 'ROOM_NOT_FOUND') onLost(); }, [error, onLost]);
  // Restore the language this participant chose when rejoining.
  const serverLang = state?.me?.lang;
  const [langSynced, setLangSynced] = useState(false);
  useEffect(() => {
    if (serverLang && !langSynced) {
      setLangSynced(true);
      if (serverLang !== lang) setLang(serverLang);
    }
  }, [serverLang, langSynced, lang, setLang]);

  const onLang = (l: Lang) => { void backend?.setLanguage(session.participantId, session.token, l); };
  const phase = state?.room.phase;
  const idx = state?.room.activityIndex ?? -1;
  const onExpire = useCallback(() => { void refresh(); }, [refresh]);
  const left = useCountdown(phase === 'active' ? state?.room.endsAt : null, serverNow, onExpire);

  return (
    <div className="page participant">
      <DemoBanner />
      <ConnectionBanner online={online} />
      <TopBar onLang={onLang}><span className="pill pill-code">{code}</span></TopBar>
      <main className="p-main">
        {!state && <div className="loading"><span className="spinner" /></div>}
        {state && phase !== 'lobby' && phase !== 'final' && <Progress index={idx} phase={phase!} />}
        {state && phase === 'lobby' && (
          <div className="card waiting">
            <div className="pulse" aria-hidden="true" />
            <h1>{t('waitingTitle')}</h1>
            <p className="me-name">{state.me?.name}</p>
            <p className="muted">{t('waitingBody')}</p>
            <p className="eyebrow">{t('waitingHost')}</p>
          </div>
        )}
        {state && (phase === 'active' || phase === 'reveal') && (
          <ActivityPlay key={idx} state={state} left={left} session={session}
            onSubmitted={() => { notify(); void refresh(); }} />
        )}
        {state && phase === 'results' && <MyResults state={state} />}
        {state && phase === 'final' && <FinalMetr />}
      </main>
    </div>
  );
}

function ActivityPlay({ state, left, session, onSubmitted }: {
  state: RoomState; left: number; session: ParticipantSession; onSubmitted: () => void;
}) {
  const { t, err, lang, num } = useI18n();
  const idx = state.room.activityIndex;
  const a = ACTIVITIES[idx];
  const active = state.room.phase === 'active';
  const qids = questionIdsOf(a);
  const doneAll = qids.every((q) => state.mine[q] !== undefined);

  const [choice, setChoice] = useState<string | null>(null);
  const [wi, setWi] = useState<WhatIfValue>(DEFAULT_WHATIF);
  const [cls, setCls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (pairs: [string, string][]) => {
    setBusy(true);
    setError('');
    try {
      const b = await getBackend();
      for (const [q, v] of pairs) {
        if (state.mine[q] !== undefined) continue;
        try {
          await b.submitAnswer(session.participantId, session.token, q, v);
        } catch (e) {
          const ae = toAppError(e);
          if (ae.code !== 'ALREADY_ANSWERED') throw ae;
        }
      }
      onSubmitted();
    } catch (e) {
      setError(err(toAppError(e).code));
    } finally {
      setBusy(false);
    }
  };

  // Points earned in this activity (computed after the server reveals the keys).
  const earned = !active ? qids.reduce((s, q) => {
    const k = state.keys[q];
    const mine = state.mine[q];
    if (k === undefined || mine === undefined) return s;
    const pts = a.kind === 'classify' ? 50 : 100;
    return s + (k === '*' || k === mine ? pts : 0);
  }, 0) : 0;
  const allRight = !active && qids.every((q) => state.mine[q] !== undefined && (state.keys[q] === '*' || state.mine[q] === state.keys[q]));

  return (
    <section className="card play">
      <div className="play-head">
        <div>
          <p className="eyebrow">{t('activity')} {idx + 1} {t('of')} 4</p>
          <h1>{a.title[lang]}</h1>
        </div>
        {active && <Timer left={left} total={DURATIONS[idx]} />}
      </div>
      {a.scenario.map((s, i) => <p key={i} className="scenario">{s[lang]}</p>)}

      {/* ---- Activity 1 & 2: multiple choice ---- */}
      {a.kind === 'choice' && (
        <>
          {idx === 0 && <ScatterVisual merged={!active} />}
          <h2 className="q">{a.question[lang]}</h2>
          <div className="options" role="radiogroup">
            {a.options.map((o) => {
              const mine = state.mine[a.questionId];
              const picked = (mine ?? choice) === o.value;
              const key = state.keys[a.questionId];
              const cls = !active && key ? (o.value === key ? 'right' : picked ? 'wrong' : 'dim') : picked ? 'picked' : '';
              return (
                <button key={o.value} type="button" role="radio" aria-checked={picked}
                  className={`option ${cls}`} disabled={!active || doneAll || busy}
                  onClick={() => setChoice(o.value)} data-value={o.value}>
                  <b className="opt-letter">{o.value}</b><span>{o.label[lang]}</span>
                </button>
              );
            })}
          </div>
          {active && !doneAll && (
            <button className="btn btn-primary btn-lg block" disabled={!choice || busy}
              onClick={() => send([[a.questionId, choice!]])} data-testid="submit">
              {busy ? t('submitting') : t('submit')}
            </button>
          )}
        </>
      )}

      {/* ---- Activity 3: What-If ---- */}
      {a.kind === 'whatif' && (
        <>
          <WhatIfSim
            value={state.mine[a.questionId] ? JSON.parse(state.mine[a.questionId]) : wi}
            onChange={active && !doneAll ? setWi : undefined} />
          {active && !doneAll && (
            <button className="btn btn-primary btn-lg block" disabled={busy}
              onClick={() => send([[a.questionId, JSON.stringify(wi)]])} data-testid="submit">
              {busy ? t('submitting') : t('submitScenario')}
            </button>
          )}
          <p className="fine">{t('fictional')}</p>
        </>
      )}

      {/* ---- Activity 4: Safe or Risky ---- */}
      {a.kind === 'classify' && (
        <>
          {active && !doneAll && <p className="muted">{t('classifyBoth')}</p>}
          {a.items.map((it, i) => {
            const mine = state.mine[it.questionId] ?? cls[it.questionId];
            const key = state.keys[it.questionId];
            return (
              <div key={it.questionId} className="classify">
                <p className="ci-label">{t('scenario')} {i + 1}</p>
                <p className="ci-text">{it.text[lang]}</p>
                <div className="seg seg-big">
                  {(['safe', 'risky'] as const).map((v) => {
                    const state2 = !active && key ? (v === key ? 'right' : mine === v ? 'wrong' : 'dim') : mine === v ? 'on' : '';
                    return (
                      <button key={v} type="button" className={`${v} ${state2}`} aria-pressed={mine === v}
                        disabled={!active || doneAll || busy} data-q={it.questionId} data-value={v}
                        onClick={() => setCls((c) => ({ ...c, [it.questionId]: v }))}>
                        {t(v)}
                      </button>
                    );
                  })}
                </div>
                {!active && key === 'safe' && <p className="fine">{SAFE_NOTE[lang]}</p>}
              </div>
            );
          })}
          {active && !doneAll && (
            <button className="btn btn-primary btn-lg block" disabled={busy || a.items.some((it) => !cls[it.questionId])}
              onClick={() => send(a.items.map((it) => [it.questionId, cls[it.questionId]]))} data-testid="submit">
              {busy ? t('submitting') : t('submit')}
            </button>
          )}
        </>
      )}

      <ErrorNote>{error}</ErrorNote>

      {active && doneAll && (
        <div className="received" role="status">
          <span className="check" aria-hidden="true" />
          <div><b>{a.kind === 'whatif' ? t('scenarioSaved') : t('answerReceived')}</b><p>{t('waitForReveal')}</p></div>
        </div>
      )}

      {!active && (
        <div className={`reveal ${allRight ? 'good' : 'meh'}`} role="status">
          <Confetti run={allRight && earned > 0} />
          <p className="reveal-title">
            {qids.some((q) => state.mine[q] === undefined) && earned === 0 ? t('notAnswered') : allRight ? t('correct') : t('incorrect')}
            <span className="reveal-pts">+{num(earned)} {t('points')}</span>
          </p>
          <p>{a.explanation[lang]}</p>
        </div>
      )}
    </section>
  );
}

function MyResults({ state }: { state: RoomState }) {
  const { t, num } = useI18n();
  const me = state.leaderboard?.find((r) => r.id === state.me?.id);
  return (
    <section className="card my-results">
      <Confetti run={me?.rank === 1} />
      {me && (
        <>
          <p className="eyebrow">{t('yourRank')}</p>
          <p className="my-rank">#{num(me.rank)}</p>
          <div className="stat-row">
            <div className="stat"><b data-testid="my-score">{num(me.total)}</b><span>{t('totalScore')}</span></div>
            <div className="stat"><b>{me.correct}/5</b><span>{t('correctAnswers')}</span></div>
          </div>
          {me.badges.length > 0 && <><p className="eyebrow">{t('badges')}</p><Badges ids={me.badges} /></>}
        </>
      )}
      <h2 className="q">{t('leaderboard')}</h2>
      <Leaderboard state={state} highlight={state.me?.id} limit={5} />
    </section>
  );
}
