import { useCallback, useEffect, useRef, useState } from 'react';
import { getBackend } from './backend';
import { type AppError, type Backend, type RoomState, toAppError } from './backend/types';

interface Options {
  roomId: string | null;
  session?: { participantId: string; token: string } | null;
  pollMs?: number;
}

/**
 * Keeps one room snapshot in sync:
 *  - realtime "changed" broadcasts trigger an immediate refresh
 *  - a light poll covers dropped connections and acts as a heartbeat
 *  - server clock offset is tracked so every timer shows the same value
 */
export function useRoom({ roomId, session, pollMs = 3000 }: Options) {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [online, setOnline] = useState(true);
  const [backend, setBackend] = useState<Backend | null>(null);
  const offset = useRef(0);
  const inflight = useRef(false);
  const queued = useRef(false);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    void getBackend().then(setBackend);
  }, []);

  const refresh = useCallback(async () => {
    if (!backend || !roomId) return;
    if (inflight.current) {
      queued.current = true;
      return;
    }
    inflight.current = true;
    try {
      const t0 = Date.now();
      const s = await backend.getState(roomId, sessionRef.current ?? undefined);
      const t1 = Date.now();
      offset.current = s.serverNow - (t0 + t1) / 2;
      setState(s);
      setError(null);
      setOnline(true);
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'NETWORK') setOnline(false);
      else setError(err);
    } finally {
      inflight.current = false;
      if (queued.current) {
        queued.current = false;
        void refresh();
      }
    }
  }, [backend, roomId]);

  useEffect(() => {
    if (!backend || !roomId) return;
    void refresh();
    const unsub = backend.subscribe(roomId, () => void refresh(), (ok) => setOnline(ok));
    const timer = setInterval(() => void refresh(), pollMs);
    const onNet = () => void refresh();
    const onOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsub();
      clearInterval(timer);
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [backend, roomId, refresh, pollMs]);

  const notify = useCallback(() => {
    if (backend && roomId) backend.notify(roomId);
  }, [backend, roomId]);

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  return { state, setState, error, online, backend, refresh, notify, serverNow };
}

/** Seconds remaining (ticks 4×/s). Calls onExpire once when it reaches 0. */
export function useCountdown(endsAt: number | null | undefined, serverNow: () => number, onExpire?: () => void) {
  const [left, setLeft] = useState(0);
  const fired = useRef<number | null>(null);
  useEffect(() => {
    if (!endsAt) {
      setLeft(0);
      return;
    }
    const tick = () => {
      const ms = Math.max(0, endsAt - serverNow());
      setLeft(Math.ceil(ms / 1000));
      if (ms <= 0 && fired.current !== endsAt) {
        fired.current = endsAt;
        onExpire?.();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [endsAt, serverNow, onExpire]);
  return left;
}
