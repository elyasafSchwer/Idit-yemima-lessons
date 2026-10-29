// Sets a student's password on Idit's behalf.
//
// Logins are username-based and map to a synthetic, undeliverable address, so
// Supabase's own password-reset email cannot work. This replaces it.
//
// The admin check is the whole security of this endpoint: without it any signed
// in user could take over any account. It is done against the CALLER's JWT, not
// against anything in the request body.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const MIN_PASSWORD_LENGTH = 6;   // matches auth.minimum_password_length

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

  let userId: string, newPassword: string;
  try {
    ({ userId, newPassword } = await req.json());
  } catch {
    return json({ error: 'invalid body' }, 400);
  }
  if (!userId || typeof newPassword !== 'string') {
    return json({ error: 'userId and newPassword required' }, 400);
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` }, 400);
  }

  // Refuse to touch another admin: Idit is the only one, and this keeps the
  // endpoint from being a lateral-movement tool if her account is ever misused.
  const { data: target } = await admin
    .from('profiles')
    .select('role, username')
    .eq('id', userId)
    .single();
  if (!target) return json({ error: 'user not found' }, 404);
  if (target.role === 'admin' && userId !== user.id) {
    return json({ error: 'cannot reset another admin' }, 403);
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (updErr) return json({ error: 'could not update password' }, 500);

  return json({ ok: true, username: target.username });
});
