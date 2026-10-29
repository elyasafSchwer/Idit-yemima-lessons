// Serves a per-session manifest. The stored playlist has relative segment names
// and a placeholder key URI; both are rewritten here so the client never learns
// a durable storage URL, and the key is fetched through an authorised route.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const BUCKET = 'lessons';
// Must outlive a full listen: VOD manifests are not reloaded, so these URLs
// have to stay valid for the whole lesson.
const SEGMENT_TTL_SECONDS = 3 * 3600;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // /functions/v1/hls/<token>/index.m3u8
  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const token = parts[parts.length - 2];
  if (!token || parts[parts.length - 1] !== 'index.m3u8') {
    return new Response('not found', { status: 404, headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: session } = await admin
    .from('playback_sessions')
    .select('track_id, expires_at, tracks(hls_prefix, segment_count)')
    .eq('token', token)
    .single();

  if (!session || new Date(session.expires_at) < new Date()) {
    return new Response('session expired', { status: 403, headers: corsHeaders });
  }

  const track = session.tracks as { hls_prefix: string; segment_count: number } | null;
  if (!track?.hls_prefix) {
    return new Response('track unavailable', { status: 404, headers: corsHeaders });
  }

  const { data: manifestBlob, error: dlErr } = await admin.storage
    .from(BUCKET)
    .download(`${track.hls_prefix}/index.m3u8`);
  if (dlErr || !manifestBlob) {
    return new Response('manifest unavailable', { status: 404, headers: corsHeaders });
  }

  const lines = (await manifestBlob.text()).split('\n');
  const segmentNames = lines.filter((l) => l.trim().endsWith('.ts')).map((l) => l.trim());

  // One batch call rather than one per segment -- a 50-minute lesson is ~295.
  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrls(
      segmentNames.map((n) => `${track.hls_prefix}/${n}`),
      SEGMENT_TTL_SECONDS,
    );
  if (signErr || !signed) {
    return new Response('could not sign segments', { status: 500, headers: corsHeaders });
  }

  const urlByName = new Map<string, string>();
  for (const s of signed) {
    if (s.signedUrl) urlByName.set(s.path!.split('/').pop()!, s.signedUrl);
  }

  const base = Deno.env.get('SUPABASE_URL')!;
  const rewritten = lines.map((line) => {
    const t = line.trim();
    if (t.startsWith('#EXT-X-KEY')) {
      return t.replace(/URI="[^"]*"/, `URI="${base}/functions/v1/hls-key/${token}"`);
    }
    if (t.endsWith('.ts')) return urlByName.get(t) ?? t;
    return line;
  });

  return new Response(rewritten.join('\n'), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-store',
    },
  });
});
