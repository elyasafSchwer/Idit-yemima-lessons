// The real entitlement gate. Everything downstream (`hls`, `hls-key`) only
// checks that the token it was handed is live -- the decision is made here,
// once, against the caller's JWT.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SESSION_TTL_HOURS = 4;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing authorization' }, 401);

  // Caller-scoped client: RLS applies, so this can only ever see their own rows.
  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userErr } = await asUser.auth.getUser();
  if (userErr || !user) return json({ error: 'not authenticated' }, 401);

  let trackId: string;
  try {
    ({ trackId } = await req.json());
  } catch {
    return json({ error: 'invalid body' }, 400);
  }
  if (!trackId) return json({ error: 'trackId required' }, 400);

  // service_role from here on: track_keys and playback_sessions are not exposed
  // to any other role, by design.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: track } = await admin
    .from('tracks')
    .select('id, status, hls_prefix, lesson_id, lessons(is_free)')
    .eq('id', trackId)
    .single();

  if (!track || track.status !== 'ready' || !track.hls_prefix) {
    return json({ error: 'track not available' }, 404);
  }

  const isFree = (track.lessons as { is_free: boolean } | null)?.is_free ?? false;
  if (!isFree) {
    const { data: allowed } = await admin.rpc('has_active_access', { uid: user.id });
    if (!allowed) {
      return json({ error: 'no_access', contact: 'https://wa.me/972527710084' }, 403);
    }
  }

  const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600_000).toISOString();

  const { error: insErr } = await admin.from('playback_sessions').insert({
    token, user_id: user.id, track_id: trackId, expires_at: expiresAt,
  });
  if (insErr) return json({ error: 'could not start session' }, 500);

  const base = Deno.env.get('SUPABASE_URL')!;
  return json({
    // MUST end in /index.m3u8: ExoPlayer infers HLS from the last path segment
    // only, and expo-audio exposes no contentType override.
    manifestUrl: `${base}/functions/v1/hls/${token}/index.m3u8`,
    expiresAt,
  });
});
