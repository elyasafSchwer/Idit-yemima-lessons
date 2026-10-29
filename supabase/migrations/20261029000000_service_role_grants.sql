-- The project has "Automatically expose new tables" OFF, which means NOTHING is
-- granted to any role by default -- including service_role. service_role
-- bypasses RLS, but RLS is not the same thing as table privileges, so the Edge
-- Functions were getting "track not available" on every lookup.
--
-- Granting here does not weaken the model: service_role is used only from Edge
-- Functions, server-side, and its key never reaches a client. The property that
-- matters -- anon and authenticated cannot touch track_keys or
-- playback_sessions -- is unchanged, because those two are still granted to
-- nobody else.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Future tables too, so the next migration cannot reintroduce this bug.
alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
