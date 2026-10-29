// Hands over the 16 raw AES bytes, and only for a live session. Deliberately
// NOT single-use: players retry and re-request keys, so a hard one-shot limit
// breaks normal playback. A generous cap still bounds abuse of a leaked token.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const MAX_KEY_SERVES = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const parts = new URL(req.url).pathname.split('/').filter(Boolean);
  const token = parts[parts.length - 1];
  if (!token) return new Response('not found', { status: 404, headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: session } = await admin
    .from('playback_sessions')
    .select('track_id, expires_at, key_serves')
    .eq('token', token)
    .single();

  if (!session || new Date(session.expires_at) < new Date()) {
    return new Response('session expired', { status: 403, headers: corsHeaders });
  }
  if (session.key_serves >= MAX_KEY_SERVES) {
    return new Response('key request limit reached', { status: 429, headers: corsHeaders });
  }

  const { data: keyRow } = await admin
    .from('track_keys')
    .select('key_bytes')
    .eq('track_id', session.track_id)
    .single();
  if (!keyRow) return new Response('key missing', { status: 404, headers: corsHeaders });

  await admin
    .from('playback_sessions')
    .update({ key_serves: session.key_serves + 1 })
    .eq('token', token);

  // bytea comes back as a \x-prefixed hex string.
  const hex = (keyRow.key_bytes as string).replace(/^\\x/, '');
  const bytes = new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));

  return new Response(bytes, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store',
    },
  });
});
