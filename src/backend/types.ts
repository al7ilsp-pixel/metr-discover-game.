export type Lang = 'en' | 'ar';
export type Phase = 'lobby' | 'active' | 'reveal' | 'results' | 'final';
export type HostAction = 'start' | 'close' | 'next' | 'final' | 'restart' | 'remove_offline';

export interface RoomInfo {
  id: string;
  code: string;
  phase: Phase;
  activityIndex: number; // -1 in lobby, 0..3 during activities
  startedAt: number | null;
  endsAt: number | null;
}

export interface ParticipantInfo {
  id: string;
  name: string;
  lang: Lang;
  online: boolean;
}

export interface LeaderRow {
  id: string;
  name: string;
  total: number;
  correct: number;
  rank: number;
  badges: string[];
}

export interface RoomState {
  serverNow: number;
  room: RoomInfo;
  participants: ParticipantInfo[];
  counts: Record<string, Record<string, number>>;
  completed: Record<string, number>;
  keys: Record<string, string>;
  mine: Record<string, string>;
  me: { id: string; name: string; lang: Lang } | null;
  leaderboard: LeaderRow[] | null;
  stats: { average: number; participation: number; maxScore: number } | null;
}

export interface ParticipantSession {
  roomId: string;
  participantId: string;
  token: string;
}

export interface Backend {
  mode: 'supabase' | 'demo';
  createRoom(): Promise<{ roomId: string; code: string; hostToken: string }>;
  findRoom(code: string): Promise<string>;
  joinRoom(code: string, name: string, lang: Lang): Promise<ParticipantSession>;
  getState(roomId: string, session?: { participantId: string; token: string }): Promise<RoomState>;
  setLanguage(participantId: string, token: string, lang: Lang): Promise<void>;
  submitAnswer(participantId: string, token: string, questionId: string, value: string): Promise<void>;
  hostAction(roomId: string, hostToken: string, action: HostAction): Promise<RoomState>;
  /** Live updates. Calls onChange whenever something in the room changes. */
  subscribe(roomId: string, onChange: () => void, onStatus: (connected: boolean) => void): () => void;
  /** Tell other devices that something changed. */
  notify(roomId: string): void;
}

/** Error codes raised by the server (same in Supabase and demo mode). */
export type ErrorCode =
  | 'ROOM_NOT_FOUND' | 'NAME_INVALID' | 'NAME_TAKEN' | 'ROOM_FULL' | 'SESSION_INVALID'
  | 'HOST_INVALID' | 'ACTIVITY_CLOSED' | 'ANSWER_INVALID' | 'ALREADY_ANSWERED'
  | 'QUESTION_INVALID' | 'ACTION_NOT_ALLOWED' | 'NETWORK' | 'NOT_CONFIGURED';

export class AppError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}

const KNOWN: ErrorCode[] = ['ROOM_NOT_FOUND', 'NAME_INVALID', 'NAME_TAKEN', 'ROOM_FULL', 'SESSION_INVALID',
  'HOST_INVALID', 'ACTIVITY_CLOSED', 'ANSWER_INVALID', 'ALREADY_ANSWERED', 'QUESTION_INVALID',
  'ACTION_NOT_ALLOWED', 'NOT_CONFIGURED'];

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const msg = (e as { message?: string })?.message ?? String(e);
  const hit = KNOWN.find((k) => msg.includes(k));
  return new AppError(hit ?? 'NETWORK');
}
