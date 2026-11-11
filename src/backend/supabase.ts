import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';
import { type Backend, type RoomState, toAppError } from './types';

/**
 * Production backend: every read/write is a Postgres function (RPC) that
 * validates tokens and answers on the server. The browser only holds the
 * public "anon" key – never the service role key.
 *
 * Live sync: Supabase Realtime Broadcast on channel "room:<id>" tells every
 * device to refresh; a light poll (every few seconds) is the safety net
 * for dropped connections.
 */
export function createSupabaseBackend(): Backend {
  const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  const channels = new Map<string, RealtimeChannel>();

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    try {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw error;
      return data as T;
    } catch (e) {
      throw toAppError(e);
    }
  }

  return {
    mode: 'supabase',
    createRoom: () => rpc('create_room', {}),
    findRoom: (code) => rpc('find_room', { p_code: code }),
    joinRoom: (code, name, lang) => rpc('join_room', { p_code: code, p_name: name, p_lang: lang }),
    getState: (roomId, s) =>
      rpc<RoomState>('get_state', {
        p_room: roomId,
        p_participant: s?.participantId ?? null,
        p_token: s?.token ?? null,
      }),
    setLanguage: (pid, token, lang) => rpc('set_language', { p_participant: pid, p_token: token, p_lang: lang }),
    submitAnswer: (pid, token, qid, value) =>
      rpc('submit_answer', { p_participant: pid, p_token: token, p_question: qid, p_value: value }),
    hostAction: (roomId, token, action) => rpc('host_action', { p_room: roomId, p_token: token, p_action: action }),

    subscribe(roomId, onChange, onStatus) {
      const ch = sb.channel(`room:${roomId}`, { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'changed' }, () => onChange());
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          onStatus(true);
          onChange();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          onStatus(false);
        }
      });
      channels.set(roomId, ch);
      return () => {
        channels.delete(roomId);
        sb.removeChannel(ch);
      };
    },

    notify(roomId) {
      const ch = channels.get(roomId);
      if (ch) void ch.send({ type: 'broadcast', event: 'changed', payload: { t: Date.now() } });
    },
  };
}
