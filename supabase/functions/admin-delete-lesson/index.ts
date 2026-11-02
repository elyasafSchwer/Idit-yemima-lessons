// Deletes a lesson or summary together with its files.
//
// Deleting the row cascades to tracks, track_keys, ingest jobs and playback
// progress, but storage objects are not rows: without this the published HLS
// segments and the raw uploads would stay in the buckets forever.
//
// As in admin-delete-user, the admin check against the CALLER's JWT is the
// whole security of this endpoint.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const BUCKETS = ['lessons', 'incoming'];
const PAGE = 1000;

// Storage has no "delete folder": list every object under the prefix,
// descending into sub-folders (entries without an id), then remove by path.
async function listAll(db: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) throw error;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) paths.push(...await listAll(db, bucket, path));
      else paths.push(path);
    }
    if (data.length < PAGE) return paths;
  }
}

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
  const { data: { user }, error: userErr } = await asUser.auth.getUser();
  if (userErr || !user) return json({ error: 'not authenticated' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: caller } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (caller?.role !== 'admin') return json({ error: 'forbidden' }, 403);

  let lessonId: string;
  try {
    ({ lessonId } = await req.json());
  } catch {
    return json({ error: 'invalid body' }, 400);
  }
  if (!lessonId) return json({ error: 'lessonId required' }, 400);

  // A running ingest would publish its files again after they were removed.
  const { data: running } = await admin
    .from('ingest_jobs')
    .select('id')
    .eq('lesson_id', lessonId)
    .eq('status', 'processing')
    .limit(1);
  if (running?.length) return json({ error: 'processing' }, 409);

  // The row goes first: once its keys are gone the segments are unplayable,
  // so a storage error afterwards only leaves dead files, never a live lesson
  // with missing audio.
  const { data: deleted, error: delErr } = await admin
    .from('lessons')
    .delete()
    .eq('id', lessonId)
    .select('id');
  if (delErr) return json({ error: 'could not delete lesson' }, 500);
  if (!deleted?.length) return json({ error: 'lesson not found' }, 404);

  let removed = 0;
  try {
    for (const bucket of BUCKETS) {
      const paths = await listAll(admin, bucket, lessonId);
      for (let i = 0; i < paths.length; i += PAGE) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + PAGE));
        if (error) throw error;
      }
      removed += paths.length;
    }
  } catch (e) {
    console.error('storage cleanup failed', lessonId, e);
    return json({ ok: true, filesRemoved: removed, cleanupFailed: true });
  }

  return json({ ok: true, filesRemoved: removed });
});
