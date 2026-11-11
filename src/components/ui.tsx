import { type ReactNode, useEffect, useState } from 'react';
import { IS_DEMO } from '../config';
import { useI18n } from '../i18n';
import { ACTIVITIES } from '../content';
import type { Lang } from '../backend/types';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const { t } = useI18n();
  return (
    <span className={`logo logo-${size}`} aria-label={t('appName')}>
      <svg viewBox="0 0 40 40" className="logo-mark" aria-hidden="true">
        <rect x="2" y="2" width="36" height="36" rx="9" className="logo-bg" />
        <rect x="10" y="22" width="4.5" height="9" rx="1.5" className="logo-bar" />
        <rect x="17.75" y="15" width="4.5" height="16" rx="1.5" className="logo-bar" />
        <rect x="25.5" y="9" width="4.5" height="22" rx="1.5" className="logo-gold" />
      </svg>
      <span className="logo-word">{t('brand')}</span>
    </span>
  );
}

export function LangSwitch({ onChange }: { onChange?: (l: Lang) => void }) {
  const { lang, setLang } = useI18n();
  const pick = (l: Lang) => {
    setLang(l);
    onChange?.(l);
  };
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      <button type="button" lang="ar" className={lang === 'ar' ? 'on' : ''} onClick={() => pick('ar')}>العربية</button>
      <span aria-hidden="true">|</span>
      <button type="button" lang="en" className={lang === 'en' ? 'on' : ''} onClick={() => pick('en')}>English</button>
    </div>
  );
}

export function TopBar({ children, onLang }: { children?: ReactNode; onLang?: (l: Lang) => void }) {
  return (
    <header className="topbar">
      <Logo size="sm" />
      <div className="topbar-mid">{children}</div>
      <LangSwitch onChange={onLang} />
    </header>
  );
}

export function DemoBanner() {
  const { t } = useI18n();
  if (!IS_DEMO) return null;
  return <div className="demo-banner" role="note">{t('demoBanner')}</div>;
}

export function ConnectionBanner({ online }: { online: boolean }) {
  const { t } = useI18n();
  if (online) return null;
  return (
    <div className="conn-banner" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> {t('reconnecting')}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="error-note" role="alert">{children}</p>;
}

export function Timer({ left, total, big }: { left: number; total: number; big?: boolean }) {
  const { t } = useI18n();
  const r = 26;
  const c = 2 * Math.PI * r;
  const frac = total ? Math.max(0, Math.min(1, left / total)) : 0;
  const urgent = left <= 10;
  return (
    <div className={`timer ${big ? 'timer-big' : ''} ${urgent ? 'urgent' : ''}`} role="timer"
      aria-label={left > 0 ? `${left} ${t('secondsLeft')}` : t('timeUp')}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={r} className="timer-track" />
        <circle cx="32" cy="32" r={r} className="timer-fill"
          style={{ strokeDasharray: c, strokeDashoffset: c * (1 - frac) }} />
      </svg>
      <span className="timer-num">{left}</span>
    </div>
  );
}

export function Progress({ index, phase }: { index: number; phase: string }) {
  const { t, lang } = useI18n();
  return (
    <ol className="progress" aria-label={t('activity')}>
      {ACTIVITIES.map((a, i) => {
        const state = phase === 'results' || phase === 'final' || i < index || (i === index && phase === 'reveal')
          ? 'done' : i === index ? 'current' : 'todo';
        return (
          <li key={i} className={`step ${state}`} title={a.title[lang]}>
            <span className="step-dot">{i + 1}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function Bars({ rows, total, correct, big }: {
  rows: { key: string; label: ReactNode; n: number }[];
  total: number;
  correct?: string | null;
  big?: boolean;
}) {
  return (
    <ul className={`bars ${big ? 'bars-big' : ''}`}>
      {rows.map((r) => {
        const pct = total ? Math.round((r.n / total) * 100) : 0;
        const state = correct ? (r.key === correct ? 'is-correct' : 'is-dim') : '';
        return (
          <li key={r.key} className={`bar ${state}`}>
            <div className="bar-head">
              <span className="bar-label">{r.label}</span>
              <span className="bar-n">{r.n}</span>
            </div>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
          </li>
        );
      })}
    </ul>
  );
}

/** QR code – rendered by the "qrcode" package (loaded on demand). */
export function QR({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((m) => (m.default ?? m).toDataURL(value, {
        width: size * 2, margin: 1, errorCorrectionLevel: 'M',
        color: { dark: '#1C2638', light: '#FFFFFF' },
      }))
      .then((url: string) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => { alive = false; };
  }, [value, size]);
  return (
    <div className="qr" style={{ width: size, height: size }}>
      {src ? <img src={src} width={size} height={size} alt="QR" /> : <span className="qr-fallback">QR</span>}
    </div>
  );
}

export function Confetti({ run }: { run: boolean }) {
  if (!run) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => (
        <i key={i} style={{ ['--i' as string]: i, ['--x' as string]: `${(i * 37) % 100}%` }} />
      ))}
    </div>
  );
}

export function Trophy({ size = 64 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="trophy" aria-hidden="true">
      <path d="M18 8h28v14a14 14 0 0 1-28 0V8z" fill="var(--gold)" />
      <path d="M18 12H9v4a10 10 0 0 0 10 10M46 12h9v4a10 10 0 0 1-10 10" fill="none" stroke="var(--gold)" strokeWidth="4" />
      <rect x="28" y="35" width="8" height="10" fill="var(--gold-deep)" />
      <rect x="19" y="45" width="26" height="8" rx="2" fill="var(--gold)" />
      <path d="M26 14l2 5 5 .5-4 3.5 1.2 5L26 25l-4.2 3 1.2-5-4-3.5 5-.5z" fill="#fff" opacity=".85" transform="translate(6 -1)" />
    </svg>
  );
}

export const fmtSar = (n: number, num: (n: number) => string, sar: string) => `${num(n)} ${sar}`;
