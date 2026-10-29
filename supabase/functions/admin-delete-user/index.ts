// Deletes a student's account on Idit's behalf.
//
// Logins are username-based and map to a synthetic, undeliverable address, so
// there is no password-reset email. A student who forgot her password is
// deleted and signs up again, and Idit re-opens her access. Deleting the auth
// user cascades to her profile, entitlements and playback progress.
//
// The admin check is the whole security of this endpoint: without it any signed
// in user could delete any account. It is done against the CALLER's JWT, not
// against anything in the request body.
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
  const { data: { user }, error: userErr } = await asUser.auth.getUser();
  if (userErr || !user) return json({ error: 'not authenticated' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Read the role with service_role so an RLS change can never turn this into
  // a self-granted permission.
  const { data: caller } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (caller?.role !== 'admin') return json({ error: 'forbidden' }, 403);

  let userId: string;
  try {
    ({ userId } = await req.json());
  } catch {
    return json({ error: 'invalid body' }, 400);
  }
  if (!userId) return json({ error: 'userId required' }, 400);
  if (userId === user.id) return json({ error: 'cannot delete yourself' }, 403);

  // An admin has to be demoted first. That keeps one misused admin account
  // from wiping out the others in a single call.
  const { data: target } = await admin
    .from('profiles')
    .select('role, username')
    .eq('id', userId)
    .single();
  if (!target) return json({ error: 'user not found' }, 404);
  if (target.role === 'admin') return json({ error: 'cannot delete an admin' }, 403);

  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return json({ error: 'could not delete user' }, 500);

  return json({ ok: true, username: target.username });
});
