import { IS_DEMO } from '../config';
import type { Backend } from './types';

let backendPromise: Promise<Backend> | null = null;

/** Picks Supabase when configured, otherwise the single-browser demo. */
export function getBackend(): Promise<Backend> {
  if (!backendPromise) {
    backendPromise = IS_DEMO
      ? import('./demo').then((m) => m.createDemoBackend())
      : import('./supabase').then((m) => m.createSupabaseBackend());
  }
  return backendPromise;
}
