import type { ParticipantSession } from './backend/types';

/** Small, safe wrappers around localStorage for reconnection. */
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
const del = (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

export const hostStore = {
  save: (code: string, roomId: string, token: string) => set(`metr.host.${code}`, JSON.stringify({ roomId, token })),
  load: (code: string): { roomId: string; token: string } | null => {
    const v = get(`metr.host.${code}`);
    return v ? JSON.parse(v) : null;
  },
};

// Per-tab copy (sessionStorage) wins, so several test tabs in one browser stay separate;
// localStorage lets a phone recover after the browser is closed and reopened.
const sget = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const sset = (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } };
const sdel = (k: string) => { try { sessionStorage.removeItem(k); } catch { /* ignore */ } };

export const participantStore = {
  save: (code: string, s: ParticipantSession) => {
    const v = JSON.stringify(s);
    sset(`metr.p.${code}`, v);
    set(`metr.p.${code}`, v);
  },
  load: (code: string): ParticipantSession | null => {
    const v = sget(`metr.p.${code}`) ?? get(`metr.p.${code}`);
    try { return v ? JSON.parse(v) : null; } catch { return null; }
  },
  clear: (code: string) => { sdel(`metr.p.${code}`); del(`metr.p.${code}`); },
};

export const joinUrl = (code: string) => `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
export const getQuery = (k: string) => new URLSearchParams(window.location.search).get(k);

export function navigate(to: string) {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
