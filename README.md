# IditYemimaLessons

Android app + website for listening to Idit's lessons on the teachings of Rabbanit Yemima Mizrachi.
Expo SDK 56 · expo-router · Supabase · TypeScript.

The Hebrew display name is temporary. See "Renaming" below.

The user interface is Hebrew only. Everything else — code, comments, docs, commits — is in English.

## Why the architecture looks like this

Audio is served as **AES-128 encrypted HLS**: ffmpeg cuts each lesson into ~10 second segments
and encrypts them, the segments live in a private bucket, and the key is served by an Edge
Function that checks entitlement. The native player (ExoPlayer) and `hls.js` in the browser
decrypt on their own — same manifest, same segments, one implementation for both platforms.

**This is not DRM.** The key is 16 bytes delivered over a plain GET. In a browser it can be broken
in minutes with DevTools. The goal is to raise the cost from "long press → share on WhatsApp"
to "you need to understand what HLS is" — not to stop a determined copier.

### Why AAC and not Opus

The sources are WhatsApp recordings in Opus 17kbps — 2-3x more efficient than AAC. But `hls.js`
does not support Opus (open request), and iOS does not support Opus in HLS at all per Apple's
spec. Converting to AAC-LC 48k is the price of the web, not a choice. A 50 minute lesson:
6.3MB at the source → ~20MB after segmenting.

**Keep the original Opus files outside Supabase.** They are the archival master, and any
re-encode can be made from them. Storing them next to the derivative would halve the capacity.

## Running

```bash
cp .env.example .env          # fill in the URL and anon key from Supabase
npm install
npm run android               # dev client -- not Expo Go
npm run web
npm run typecheck
```

`npm run android` builds a native dev client. **Expo Go will not work** because of
`expo-build-properties` and the native permissions for background playback.

## Bootstrap steps you cannot skip

1. **Apply the migrations** in `supabase/migrations/` (`supabase db push`).

2. **Promote Idit to admin.** The `handle_new_user()` trigger creates every user as `student`.
   After Idit signs up in the app, run once:
   ```sql
   update profiles set role = 'admin' where username = '<Idit''s username>';
   ```
   **Without this, nobody can grant access to anyone.**

3. **Weekly ping.** A free Supabase project is paused after a week without activity. The
   `.github/workflows/keepalive.yml` workflow runs a trivial query. Without it the app will die
   quietly during a vacation.

## Zscaler — if Gradle fails with `PKIX path building failed`

This machine is behind Zscaler, which re-signs TLS. The root CA is in the macOS Keychain
but not in the Java truststore, so Gradle cannot download dependencies. The certificate has
already been imported into the JDK in use (`temurin-21.0.11`), with a backup next to it:

```bash
# What was done, in case it needs repeating on another JDK:
security find-certificate -a -c "Zscaler Root" -p /Library/Keychains/System.keychain > /tmp/zscaler-root.pem
keytool -importcert -noprompt -trustcacerts -alias zscalerroot \
  -file /tmp/zscaler-root.pem -storepass changeit \
  -keystore "$JAVA_HOME/lib/security/cacerts"

# Undo:
keytool -delete -alias zscalerroot -keystore "$JAVA_HOME/lib/security/cacerts" -storepass changeit
```

### Same problem, three times

Zscaler breaks every TLS client that keeps its own CA list, and every runtime looks for it in a
different place. `curl` worked from the start because it reads the macOS Keychain directly.

| Who | Where the fix is |
|---|---|
| Gradle / sdkmanager (Java) | Certificate imported into the JDK's `cacerts` |
| Supabase CLI (Node/Bun) | `NODE_EXTRA_CA_CERTS=$HOME/.certs/zscaler-root.pem` |
| The app in the emulator | Certificate in the AVD's system store |

Every `supabase` command here needs the environment variable. To solve it once for every
Node tool on the machine, add to `~/.zshrc`:

```bash
export NODE_EXTRA_CA_CERTS="$HOME/.certs/zscaler-root.pem"
```

### The emulator — `ZscalerDev`

This AVD is **Android 13 (API 33) with a `google_apis` image**, on purpose: from Android 14
the certificate store moved to APEX and `adb remount` is no longer enough, and Play Store
images do not allow `adb root` at all.

**It must be started with `-writable-system`:**

```bash
emulator -avd ZscalerDev -writable-system
```

Without that flag, or after `-wipe-data`, the certificate disappears and every HTTPS call fails
again. To reinstall:

```bash
adb root && adb remount
HASH=$(openssl x509 -subject_hash_old -noout -in ~/.certs/zscaler-root.pem)
adb push ~/.certs/zscaler-root.pem /data/local/tmp/zsc.pem
adb shell "cp /data/local/tmp/zsc.pem /system/etc/security/cacerts/$HASH.0 && chmod 644 /system/etc/security/cacerts/$HASH.0"
```

## Traps we already fell into

- **`supabase config push` pushes everything that is declared.** The generated file contains
  local development defaults, and a blind push would have disabled MFA, shortened OTP and
  exceeded the connection quota. **Commenting a line out does not cancel a declaration** — the
  CLI merges over a built-in base config, so the only way to keep a production value is to
  declare it with the existing value. 10 properties are pinned this way in `config.toml`, with a
  comment. **Always `config diff` before `config push`.**

- **`service_role` bypasses RLS but not table privileges.** With "Automatically expose new
  tables" turned off, nothing is granted to anyone — including service_role. This caused
  `track not available` on every player call. See `20261029000000_service_role_grants.sql`,
  which also includes `alter default privileges` so the next migration does not bring the bug back.

- **HLS segments carry a `.ts` extension**, and TypeScript will try to compile them. `proto/` is
  excluded in `tsconfig.json`.

- **The manifest path must end with `/index.m3u8`.** ExoPlayer infers the content type from
  `getLastPathSegment()` only, and `expo-audio` has no `contentType` override.

- **`verify_jwt = false` is required for `hls` and `hls-key`** — the native player cannot attach
  an `Authorization` header to a manifest or key request. The token in the URL is the auth.

- **A new native dependency requires running `npm run android` again.** Installing
  `@react-native-community/slider` without a rebuild gave
  `Can't find ViewManager 'RNCSlider'`.

## Renaming

The technical identity is final: `com.idityemimalessons.app` (`android.package` and
`ios.bundleIdentifier`), slug `idit-yemima-lessons`, scheme `idityemimalessons`.
**Do not change `android.package` after the first Play Store build** — that counts as a
completely new app.

When Idit picks the Hebrew name, change only `expo.name` in `app.json` (and the store listing).

**Do not change the domain in `lib/username.ts`.** It is part of every account's login email,
so changing it would lock out all existing users.

After changing `android.package`, regenerate the native project: `npx expo prebuild --clean`.

## Current status (2026-10-29)

**Working and verified on a device:** sign-up, sign-in, catalog, encrypted HLS player, background
playback, resume position, admin dashboard, granting/extending/revoking access, password reset.
Every security boundary was also tested in the negative direction (a student is blocked from
`track_keys`, from uploading, from resetting passwords, and from a paid lesson without access).

**Ingest pipeline: active.** Uploads from the admin screen trigger
`.github/workflows/ingest.yml` through the `ingest-dispatch` function. Verified end to end on
2026-10-29 (a 49 minute lesson, ~1 minute on the runner). Secrets: `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` in GitHub Actions; `GITHUB_DISPATCH_TOKEN` (fine-grained PAT,
Contents read/write on this repo only — it expires, renew it when uploads fail with
`dispatch failed: 401`) and `GITHUB_REPOSITORY` in Supabase.

**Web:** the page and bundle build and `hls.js` is bundled, but the browser player has
**not been tested manually yet**.

### Next steps
1. A "retry" button for failed uploads on the admin screen (today only a manual
   `gh workflow run ingest.yml -f lesson_id=<uuid> -f kind=full` can retry)
2. Test the web player manually
3. Rebuild the dev client after the package rename: `npx expo prebuild --clean && npm run android`

Repository: https://github.com/elyasafSchwer/IditYemimaLessons

### Test data to delete before going live
- Users: `rutitest` (admin) and a student with a Hebrew username (tests Hebrew usernames)
- The prototype lesson ("Hakarat HaTov") and lesson "2" (`failed`)
- Entitlements granted during testing may have `method` stored in Hebrew; new ones use `manual`
- **Idit does not exist yet.** After she signs up:
  `update profiles set role='admin' where username='<her username>';`

### Open for Idit to decide
- The final app name
- The merge order of the three parts of lesson 1
- Whether the summaries stay paid

### Project details
- Supabase ref: `slzwyahomcaqjbcuopsv` (eu-west-1)
- 5 Edge Functions deployed; `hls` and `hls-key` with `verify_jwt=false`
- Private buckets: `lessons` (encrypted segments), `incoming` (raw recordings)

## Structure

```
app/            expo-router screens
lib/            supabase, theme, username
context/        AuthProvider
supabase/       migrations, Edge Functions
scripts/        local ingest (ffmpeg → encrypted HLS)
proto/          HLS prototype -- not in git, can be deleted
data/           source recordings -- not in git
```
