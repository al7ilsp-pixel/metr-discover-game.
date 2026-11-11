/**
 * LOCAL DEMO MODE – for UI testing only.
 *
 * Used automatically when Supabase environment variables are missing.
 * It imitates the server functions of the SQL migration inside ONE
 * browser: open the host, presentation and participant screens in
 * several tabs of the same browser. Phones on other devices CANNOT
 * join in demo mode – real multiplayer needs Supabase.
 */
import { AppError, type Backend, type HostAction, type Lang, type RoomState } from './types';

interface DB {
  rooms: Record<string, {
    id: string; code: string; hostToken: string; phase: RoomState['room']['phase'];
    activityIndex: number; startedAt: number | null; endsAt: number | null; createdAt: number;
  }>;
  participants: Record<string, { id: string; roomId: string; name: string; lang: Lang; token: string; joinedAt: number; lastSeen: number }>;
  answers: { roomId: string; participantId: string; questionId: string; value: string; isCorrect: boolean | null; points: number; at: number }[];
  events: { roomId: string; event: string; at: number }[];
}

const KEY = 'metr-demo-db-v1';
const DURATIONS = [45, 60, 90, 60];
const QUESTIONS: { id: string; activity: number; kind: 'choice' | 'whatif' | 'classify'; points: number; key: string }[] = [
  { id: 'a1q1', activity: 0, kind: 'choice', points: 100, key: 'B' },
  { id: 'a2q1', activity: 1, kind: 'choice', points: 100, key: 'B' },
  { id: 'a3q1', activity: 2, kind: 'whatif', points: 100, key: '*' },
  { id: 'a4q1', activity: 3, kind: 'classify', points: 50, key: 'risky' },
  { id: 'a4q2', activity: 3, kind: 'classify', points: 50, key: 'safe' },
];
const MAX_SCORE = QUESTIONS.reduce((s, q) => s + q.points, 0);
const ONLINE_MS = 25_000;

const fail = (code: ConstructorParameters<typeof AppError>[0]) => { throw new AppError(code); };
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch { /* ignore */ }
  return { rooms: {}, participants: {}, answers: [], events: [] };
}
function save(db: DB) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

/** Serialise read-modify-write between tabs (like a DB transaction). */
async function tx<T>(fn: (db: DB) => T): Promise<T> {
  const run = () => {
    const db = load();
    const out = fn(db);
    save(db);
    return out;
  };
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(KEY, async () => run()) as Promise<T>;
  }
  return run();
}

function grade(db: DB, roomId: string, activity: number) {
  for (const a of db.answers) {
    if (a.roomId !== roomId) continue;
    const q = QUESTIONS.find((x) => x.id === a.questionId)!;
    if (q.activity !== activity) continue;
    const ok = q.key === '*' || a.value === q.key;
    a.isCorrect = ok;
    a.points = ok ? q.points : 0;
  }
}

function closeActivity(db: DB, roomId: string, now: number) {
  const r = db.rooms[roomId];
  if (r.phase !== 'active') return;
  grade(db, roomId, r.activityIndex);
  r.phase = 'reveal';
  r.endsAt = now;
  db.events.push({ roomId, event: 'activity_closed', at: now });
}

function maybeAutoclose(db: DB, roomId: string, now: number) {
  const r = db.rooms[roomId];
  if (!r || r.phase !== 'active') return;
  if (r.endsAt !== null && now >= r.endsAt) return closeActivity(db, roomId, now);
  const qs = QUESTIONS.filter((q) => q.activity === r.activityIndex).map((q) => q.id);
  const people = Object.values(db.participants).filter((p) => p.roomId === roomId);
  if (!people.length) return;
  const allDone = people.every((p) =>
    qs.every((qid) => db.answers.some((a) => a.participantId === p.id && a.questionId === qid)));
  if (allDone) closeActivity(db, roomId, now);
}

function bucket(qid: string, value: string) {
  if (qid !== 'a3q1') return value;
  const d = Number(JSON.parse(value).discount);
  return d <= 10 ? '0-10' : d <= 20 ? '11-20' : '21-30';
}

function roomState(db: DB, roomId: string, pid: string | null, now: number): RoomState {
  const r = db.rooms[roomId];
  if (!r) fail('ROOM_NOT_FOUND');
  const people = Object.values(db.participants).filter((p) => p.roomId === roomId).sort((a, b) => a.joinedAt - b.joinedAt);
  const answers = db.answers.filter((a) => a.roomId === roomId);

  const counts: RoomState['counts'] = {};
  for (const a of answers) {
    const b = bucket(a.questionId, a.value);
    (counts[a.questionId] ??= {})[b] = (counts[a.questionId][b] ?? 0) + 1;
  }
  const completed: Record<string, number> = {};
  for (let i = 0; i < 4; i++) {
    const qs = QUESTIONS.filter((q) => q.activity === i).map((q) => q.id);
    const n = people.filter((p) => qs.every((qid) => answers.some((a) => a.participantId === p.id && a.questionId === qid))).length;
    if (n) completed[String(i)] = n;
  }
  const keys: Record<string, string> = {};
  for (const q of QUESTIONS) {
    if (r.phase === 'results' || r.phase === 'final' || q.activity < r.activityIndex ||
        (q.activity === r.activityIndex && r.phase === 'reveal')) keys[q.id] = q.key;
  }
  const mine: Record<string, string> = {};
  if (pid) for (const a of answers) if (a.participantId === pid) mine[a.questionId] = a.value;
  const me = pid ? { id: pid, name: db.participants[pid].name, lang: db.participants[pid].lang } : null;

  let leaderboard: RoomState['leaderboard'] = null;
  let stats: RoomState['stats'] = null;
  if (r.phase === 'results' || r.phase === 'final') {
    const rows = people.map((p) => {
      const mineA = answers.filter((a) => a.participantId === p.id);
      const ok = (q: string) => mineA.some((a) => a.questionId === q && a.isCorrect);
      const badges: string[] = [];
      if (ok('a1q1')) badges.push('data_explorer');
      if (ok('a2q1') && mineA.some((a) => a.questionId === 'a3q1')) badges.push('decision_maker');
      if (ok('a4q1') && ok('a4q2')) badges.push('ai_guardian');
      return {
        id: p.id, name: p.name,
        total: mineA.reduce((s, a) => s + a.points, 0),
        correct: mineA.filter((a) => a.isCorrect).length,
        rank: 0, badges,
      };
    }).sort((a, b) => b.total - a.total || b.correct - a.correct);
    rows.forEach((row, i) => {
      const prev = rows[i - 1];
      row.rank = prev && prev.total === row.total && prev.correct === row.correct ? prev.rank : i + 1;
    });
    leaderboard = rows;
    stats = {
      average: rows.length ? Math.round(rows.reduce((s, x) => s + x.total, 0) / rows.length) : 0,
      participation: people.length ? Math.round((100 * answers.length) / (people.length * QUESTIONS.length)) : 0,
      maxScore: MAX_SCORE,
    };
  }

  return {
    serverNow: now,
    room: { id: r.id, code: r.code, phase: r.phase, activityIndex: r.activityIndex, startedAt: r.startedAt, endsAt: r.endsAt },
    participants: people.map((p) => ({ id: p.id, name: p.name, lang: p.lang, online: now - p.lastSeen < ONLINE_MS })),
    counts, completed, keys, mine, me, leaderboard, stats,
  };
}

function authP(db: DB, pid: string, token: string) {
  const p = db.participants[pid];
  if (!p || p.token !== token) fail('SESSION_INVALID');
  return p;
}

export function createDemoBackend(): Backend {
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('metr-demo') : null;
  const listeners = new Map<string, Set<() => void>>();
  bc?.addEventListener('message', (e) => listeners.get(e.data?.roomId)?.forEach((fn) => fn()));
  const wait = () => new Promise((r) => setTimeout(r, 60)); // tiny latency, like a network

  return {
    mode: 'demo',
    async createRoom() {
      await wait();
      return tx((db) => {
        const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let code = '';
        do {
          code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
        } while (Object.values(db.rooms).some((r) => r.code === code));
        const id = rid();
        const hostToken = rid();
        db.rooms[id] = { id, code, hostToken, phase: 'lobby', activityIndex: -1, startedAt: null, endsAt: null, createdAt: Date.now() };
        return { roomId: id, code, hostToken };
      });
    },
    async findRoom(code) {
      await wait();
      const r = Object.values(load().rooms).find((x) => x.code === code.trim().toUpperCase());
      if (!r) fail('ROOM_NOT_FOUND');
      return r!.id;
    },
    async joinRoom(code, name, lang) {
      await wait();
      return tx((db) => {
        const r = Object.values(db.rooms).find((x) => x.code === code.trim().toUpperCase());
        if (!r) fail('ROOM_NOT_FOUND');
        const clean = name.trim().replace(/\s+/g, ' ');
        if (clean.length < 1 || clean.length > 24) fail('NAME_INVALID');
        const people = Object.values(db.participants).filter((p) => p.roomId === r!.id);
        if (people.length >= 200) fail('ROOM_FULL');
        if (people.some((p) => p.name.toLowerCase() === clean.toLowerCase())) fail('NAME_TAKEN');
        const id = rid();
        const token = rid();
        db.participants[id] = { id, roomId: r!.id, name: clean, lang, token, joinedAt: Date.now(), lastSeen: Date.now() };
        return { roomId: r!.id, participantId: id, token };
      });
    },
    async getState(roomId, s) {
      await wait();
      return tx((db) => {
        const now = Date.now();
        if (s) {
          const p = authP(db, s.participantId, s.token);
          if (p.roomId !== roomId) fail('SESSION_INVALID');
          p.lastSeen = now;
        }
        maybeAutoclose(db, roomId, now);
        return roomState(db, roomId, s?.participantId ?? null, now);
      });
    },
    async setLanguage(pid, token, lang) {
      await tx((db) => { authP(db, pid, token).lang = lang; });
    },
    async submitAnswer(pid, token, qid, value) {
      await wait();
      await tx((db) => {
        const now = Date.now();
        const p = authP(db, pid, token);
        maybeAutoclose(db, p.roomId, now);
        const r = db.rooms[p.roomId];
        const q = QUESTIONS.find((x) => x.id === qid);
        if (!q) fail('QUESTION_INVALID');
        if (r.phase !== 'active' || q!.activity !== r.activityIndex || (r.endsAt && now > r.endsAt + 1000)) fail('ACTIVITY_CLOSED');
        let v = value.trim();
        if (q!.kind === 'choice' && !['A', 'B', 'C', 'D'].includes(v)) fail('ANSWER_INVALID');
        if (q!.kind === 'classify' && !['safe', 'risky'].includes(v)) fail('ANSWER_INVALID');
        if (q!.kind === 'whatif') {
          let price = NaN, discount = NaN;
          try { ({ price, discount } = JSON.parse(v)); } catch { fail('ANSWER_INVALID'); }
          if (!(price >= 500000 && price <= 1200000 && discount >= 0 && discount <= 30)) fail('ANSWER_INVALID');
          v = JSON.stringify({ price: Math.round(price), discount: Math.round(discount) });
        }
        if (db.answers.some((a) => a.participantId === pid && a.questionId === qid)) fail('ALREADY_ANSWERED');
        db.answers.push({ roomId: p.roomId, participantId: pid, questionId: qid, value: v, isCorrect: null, points: 0, at: now });
        p.lastSeen = now;
        maybeAutoclose(db, p.roomId, now);
      });
    },
    async hostAction(roomId, hostToken, action: HostAction) {
      await wait();
      return tx((db) => {
        const now = Date.now();
        const r = db.rooms[roomId];
        if (!r || r.hostToken !== hostToken) fail('HOST_INVALID');
        maybeAutoclose(db, roomId, now);
        const startActivity = (i: number) => {
          r.phase = 'active'; r.activityIndex = i; r.startedAt = now; r.endsAt = now + DURATIONS[i] * 1000;
        };
        if (action === 'start' && r.phase === 'lobby') startActivity(0);
        else if (action === 'close' && r.phase === 'active') closeActivity(db, roomId, now);
        else if (action === 'next' && r.phase === 'reveal' && r.activityIndex < 3) startActivity(r.activityIndex + 1);
        else if (action === 'next' && r.phase === 'reveal' && r.activityIndex === 3) { r.phase = 'results'; r.startedAt = now; r.endsAt = null; }
        else if (action === 'final' && r.phase === 'results') { r.phase = 'final'; r.startedAt = now; r.endsAt = null; }
        else if (action === 'restart') {
          db.answers = db.answers.filter((a) => a.roomId !== roomId);
          r.phase = 'lobby'; r.activityIndex = -1; r.startedAt = null; r.endsAt = null;
        } else if (action === 'remove_offline' && r.phase === 'lobby') {
          for (const p of Object.values(db.participants)) {
            if (p.roomId === roomId && now - p.lastSeen >= ONLINE_MS) delete db.participants[p.id];
          }
        } else fail('ACTION_NOT_ALLOWED');
        db.events.push({ roomId, event: 'host_' + action, at: now });
        return roomState(db, roomId, null, now);
      });
    },
    subscribe(roomId, onChange, onStatus) {
      const set = listeners.get(roomId) ?? new Set();
      set.add(onChange);
      listeners.set(roomId, set);
      const onStorage = (e: StorageEvent) => { if (e.key === KEY) onChange(); };
      window.addEventListener('storage', onStorage);
      onStatus(true);
      return () => {
        set.delete(onChange);
        window.removeEventListener('storage', onStorage);
      };
    },
    notify(roomId) {
      bc?.postMessage({ roomId });
    },
  };
}
