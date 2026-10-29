// Kicks off the GitHub Actions ingest workflow after Idit uploads recordings.
// Edge Functions cannot run ffmpeg (subprocess spawning is blocked), so the
// merge/transcode/encrypt work happens on a runner instead.
//
// Requires two secrets, set with:
//   supabase secrets set GITHUB_DISPATCH_TOKEN=... GITHUB_REPOSITORY=owner/repo
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing authorization' }, 401);

  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: 'not authenticated' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: caller } = await admin
    .from('profiles').select('role').eq('id', user.id).single();
  if (caller?.role !== 'admin') return json({ error: 'forbidden' }, 403);

  let lessonId: string, kind: string;
  try {
    ({ lessonId, kind } = await req.json());
  } catch {
    return json({ error: 'invalid body' }, 400);
  }
  if (!lessonId || (kind !== 'full' && kind !== 'summary')) {
    return json({ error: 'lessonId and kind (full|summary) required' }, 400);
  }

  const token = Deno.env.get('GITHUB_DISPATCH_TOKEN');
  const repo = Deno.env.get('GITHUB_REPOSITORY');
  if (!token || !repo) {
    // Fail loudly rather than leaving the lesson stuck on "processing".
    await markFailed(admin, lessonId, kind, 'ingest pipeline is not configured');
    return json({ error: 'pipeline not configured' }, 503);
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_type: 'ingest-lesson',
      client_payload: { lesson_id: lessonId, kind },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    await markFailed(admin, lessonId, kind, `dispatch failed: ${res.status}`);
    return json({ error: 'dispatch failed', status: res.status, detail }, 502);
  }

  return json({ ok: true });
});

// A failed dispatch has to mark BOTH rows. Marking only the job leaves the
// lesson on 'processing' -- hidden from students and not flagged to Idit.
async function markFailed(
  admin: ReturnType<typeof createClient>,
  lessonId: string,
  kind: string,
  error: string,
) {
  await Promise.all([
    admin.from('ingest_jobs')
      .update({ status: 'failed', error })
      .eq('lesson_id', lessonId).eq('kind', kind).eq('status', 'processing'),
    admin.from('lessons')
      .update({ status: 'failed' })
      .eq('id', lessonId).eq('status', 'processing'),
  ]);
}
