import { supabase } from '@/lib/supabase';

export type PlaybackSession = { manifestUrl: string; expiresAt: string };

export class NoAccessError extends Error {
  constructor() { super('no_access'); }
}

/**
 * Asks the backend to open a playback session. This is where entitlement is
 * actually decided; the manifest and key routes only validate the token it
 * returns. Throws NoAccessError (403) so callers can show the WhatsApp CTA.
 */
export async function startPlaybackSession(trackId: string): Promise<PlaybackSession> {
  const { data, error } = await supabase.functions.invoke('playback-session', {
    body: { trackId },
  });

  if (error) {
    // supabase-js surfaces non-2xx as FunctionsHttpError with the body attached.
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 403) throw new NoAccessError();
    throw error;
  }
  return data as PlaybackSession;
}

/** Resume point, so a 50-minute lesson can be heard across several sittings. */
export async function loadProgress(trackId: string): Promise<number> {
  const { data } = await supabase
    .from('playback_progress')
    .select('position_seconds')
    .eq('track_id', trackId)
    .maybeSingle();
  return data?.position_seconds ?? 0;
}

export async function saveProgress(trackId: string, seconds: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('playback_progress').upsert(
    {
      user_id: user.id,
      track_id: trackId,
      position_seconds: Math.floor(seconds),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,track_id' },
  );
}

export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
