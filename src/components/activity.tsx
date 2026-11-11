import { ACTIVITIES, ORIGINAL_PRICE, PRICE_MAX, PRICE_MIN, SAFE_NOTE, type Activity } from '../content';
import { useI18n } from '../i18n';
import type { RoomState } from '../backend/types';
import { Bars, Trophy } from './ui';
import { METR_MAIN_URL } from '../config';

/* ---------- Activity 1 visual: scattered files → one dashboard ---------- */
export function ScatterVisual({ merged }: { merged: boolean }) {
  const { lang } = useI18n();
  const files = lang === 'ar'
    ? ['العقارات.xlsx', 'الصفقات.xlsx', 'الإيجارات.xlsx', 'السوق.pdf']
    : ['Properties.xlsx', 'Deals.xlsx', 'Rents.xlsx', 'Market.pdf'];
  return (
    <div className={`scatter ${merged ? 'merged' : ''}`} aria-hidden="true">
      {files.map((f, i) => (
        <div key={f} className={`file f${i}`}>
          <span className="file-ico" />
          <span className="file-name">{f}</span>
        </div>
      ))}
      <div className="dash">
        <div className="dash-row"><i style={{ height: '40%' }} /><i style={{ height: '65%' }} /><i style={{ height: '50%' }} /><i style={{ height: '85%' }} /></div>
        <div className="dash-line" />
      </div>
    </div>
  );
}

/* ---------- Activity 3: What-If simulation ---------- */
export interface WhatIfValue { price: number; discount: number }

export function WhatIfSim({ value, onChange, disabled, compact }: {
  value: WhatIfValue;
  onChange?: (v: WhatIfValue) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { t, num } = useI18n();
  const amount = Math.round((value.price * value.discount) / 100);
  const newPrice = value.price - amount;
  const keepPct = 100 - value.discount;
  return (
    <div className={`whatif ${compact ? 'compact' : ''}`}>
      <div className="wi-grid">
        <div className="wi-cell"><span>{t('originalPrice')}</span><b>{num(value.price)} <small>{t('sar')}</small></b></div>
        <div className="wi-cell"><span>{t('discount')}</span><b>{num(value.discount)}%</b></div>
        <div className="wi-cell"><span>{t('discountAmount')}</span><b className="neg">− {num(amount)} <small>{t('sar')}</small></b></div>
        <div className="wi-cell wi-new"><span>{t('newPrice')}</span><b key={newPrice} className="pop">{num(newPrice)} <small>{t('sar')}</small></b></div>
      </div>

      <div className="wi-bar" aria-hidden="true">
        <div className="wi-keep" style={{ width: `${keepPct}%` }} />
        <div className="wi-cut" style={{ width: `${value.discount}%` }} />
      </div>

      {onChange && (
        <div className="wi-sliders">
          <label>
            <span>{t('propertyPrice')} <b>{num(value.price)} {t('sar')}</b></span>
            <input type="range" min={PRICE_MIN} max={PRICE_MAX} step={10000} value={value.price} disabled={disabled}
              onChange={(e) => onChange({ ...value, price: Number(e.target.value) })} />
          </label>
          <label>
            <span>{t('discount')} <b>{num(value.discount)}%</b></span>
            <input type="range" min={0} max={30} step={1} value={value.discount} disabled={disabled}
              onChange={(e) => onChange({ ...value, discount: Number(e.target.value) })} />
          </label>
        </div>
      )}
    </div>
  );
}

export const DEFAULT_WHATIF: WhatIfValue = { price: ORIGINAL_PRICE, discount: 10 };

/* ---------- Shared board for host + projector ---------- */
export function ActivityBoard({ state, big }: { state: RoomState; big?: boolean }) {
  const { t, lang } = useI18n();
  const idx = state.room.activityIndex;
  const a: Activity = ACTIVITIES[idx];
  const revealed = state.room.phase === 'reveal';
  const total = state.participants.length;

  return (
    <section className={`board ${big ? 'board-big' : ''}`}>
      <p className="eyebrow">{t('activity')} {idx + 1} · {a.topic[lang]}</p>
      <h1 className="board-title">{a.title[lang]}</h1>
      {a.scenario.map((s, i) => <p key={i} className="board-scenario">{s[lang]}</p>)}

      {a.kind === 'choice' && (
        <>
          {idx === 0 && <ScatterVisual merged={revealed} />}
          <h2 className="board-q">{a.question[lang]}</h2>
          <Bars big={big} total={Math.max(1, total)} correct={revealed ? state.keys[a.questionId] : null}
            rows={a.options.map((o) => ({
              key: o.value,
              label: <><b className="opt-letter">{o.value}</b> {o.label[lang]}</>,
              n: state.counts[a.questionId]?.[o.value] ?? 0,
            }))} />
        </>
      )}

      {a.kind === 'whatif' && (
        <>
          <WhatIfSim value={DEFAULT_WHATIF} compact={!big} />
          <h2 className="board-q small">{t('discountChosen')}</h2>
          <Bars big={big} total={Math.max(1, total)} rows={['0-10', '11-20', '21-30'].map((k) => ({
            key: k, label: `${k}%`, n: state.counts[a.questionId]?.[k] ?? 0,
          }))} />
          <p className="fine">{t('fictional')}</p>
        </>
      )}

      {a.kind === 'classify' && (
        <div className="classify-board">
          {a.items.map((it, i) => {
            const key = revealed ? state.keys[it.questionId] : null;
            return (
              <div key={it.questionId} className="classify-item">
                <p className="ci-label">{t('scenario')} {i + 1}</p>
                <p className="ci-text">{it.text[lang]}</p>
                <Bars big={big} total={Math.max(1, total)} correct={key} rows={[
                  { key: 'safe', label: t('safe'), n: state.counts[it.questionId]?.safe ?? 0 },
                  { key: 'risky', label: t('risky'), n: state.counts[it.questionId]?.risky ?? 0 },
                ]} />
                {key === 'safe' && <p className="fine">{SAFE_NOTE[lang]}</p>}
              </div>
            );
          })}
        </div>
      )}

      {revealed && <div className="takeaway"><span className="takeaway-mark" aria-hidden="true" />{a.explanation[lang]}</div>}
    </section>
  );
}

/* ---------- Results ---------- */
export function Leaderboard({ state, highlight, limit = 10, big }: {
  state: RoomState; highlight?: string; limit?: number; big?: boolean;
}) {
  const { t, num } = useI18n();
  const rows = state.leaderboard ?? [];
  const top = rows[0];
  // Everyone tied for first shares the trophy.
  const leaders = rows.filter((r) => r.rank === 1);
  const leaderNames = leaders.slice(0, 3).map((r) => r.name).join(' · ') + (leaders.length > 3 ? ` +${leaders.length - 3}` : '');
  return (
    <div className={`results ${big ? 'results-big' : ''}`}>
      {top && (
        <div className="winner">
          <Trophy size={big ? 96 : 64} />
          <div>
            <p className="eyebrow">{t('winner')}</p>
            <p className="winner-name">{leaderNames}</p>
            <p className="winner-score">{num(top.total)} {t('points')}</p>
          </div>
        </div>
      )}
      {state.stats && (
        <div className="stat-row">
          <div className="stat"><b>{num(state.stats.average)}</b><span>{t('groupAverage')}</span></div>
          <div className="stat"><b>{num(state.stats.participation)}%</b><span>{t('participation')}</span></div>
          <div className="stat"><b>{num(rows.length)}</b><span>{t('participants')}</span></div>
        </div>
      )}
      <ol className="board-list">
        {rows.slice(0, limit).map((r) => (
          <li key={r.id} className={`lb-row ${r.rank === 1 ? 'first' : ''} ${r.id === highlight ? 'me' : ''}`}>
            <span className="lb-rank">{r.rank}</span>
            <span className="lb-name">{r.name}<Badges ids={r.badges} small /></span>
            <span className="lb-correct" title={t('correctAnswers')}>{r.correct}/5</span>
            <span className="lb-total">{num(r.total)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const BADGE_ICON: Record<string, string> = { data_explorer: '◆', decision_maker: '▲', ai_guardian: '●' };
export function Badges({ ids, small }: { ids: string[]; small?: boolean }) {
  const { t } = useI18n();
  if (!ids.length) return null;
  return (
    <span className={`badges ${small ? 'small' : ''}`}>
      {ids.map((b) => (
        <span key={b} className={`badge badge-${b}`} title={t(`badge_${b}` as 'badge_ai_guardian')}>
          <i aria-hidden="true">{BADGE_ICON[b]}</i>{!small && t(`badge_${b}` as 'badge_ai_guardian')}
        </span>
      ))}
    </span>
  );
}

/* ---------- Final transition to Metr ---------- */
export function FinalMetr({ big }: { big?: boolean }) {
  const { t } = useI18n();
  return (
    <section className={`final ${big ? 'final-big' : ''}`}>
      <p className="final-head">{t('finalHeadline')}</p>
      <div className="final-brand">
        <svg viewBox="0 0 40 40" className="final-mark" aria-hidden="true">
          <rect x="10" y="22" width="4.5" height="9" rx="1.5" fill="var(--beige)" />
          <rect x="17.75" y="15" width="4.5" height="16" rx="1.5" fill="var(--beige)" />
          <rect x="25.5" y="9" width="4.5" height="22" rx="1.5" fill="var(--gold)" />
        </svg>
        <h1>{t('brand')}</h1>
      </div>
      <p className="final-sub">{t('metrSub')}</p>
      <ul className="caps">
        <li><span className="cap-ico cap-1" aria-hidden="true" />{t('cap1')}</li>
        <li><span className="cap-ico cap-2" aria-hidden="true" />{t('cap2')}</li>
        <li><span className="cap-ico cap-3" aria-hidden="true" />{t('cap3')}</li>
      </ul>
      {METR_MAIN_URL ? (
        <a className="btn btn-gold btn-lg" href={METR_MAIN_URL} target="_blank" rel="noopener noreferrer">{t('exploreMetr')}</a>
      ) : (
        <>
          <button type="button" className="btn btn-gold btn-lg" disabled>{t('exploreMetr')}</button>
          <p className="fine">{t('metrUrlMissing')}</p>
        </>
      )}
    </section>
  );
}
