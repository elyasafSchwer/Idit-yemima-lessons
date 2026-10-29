#!/usr/bin/env bash
# Turn a set of WhatsApp voice notes into one AES-128 encrypted HLS track.
#
#   scripts/ingest.sh --lesson <uuid> --kind full|summary part1.ogg part2.ogg ...
#
# Parts are concatenated IN THE ORDER GIVEN -- WhatsApp filenames carry no
# reliable ordering, so the caller decides.
#
# Why AAC and not the original Opus: hls.js cannot play Opus, and iOS does not
# support Opus in HLS at all. The transcode is the price of the web build.
#
# Needs: ffmpeg, openssl, curl, python3, and SUPABASE_SERVICE_ROLE_KEY.
set -euo pipefail

: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?set SUPABASE_SERVICE_ROLE_KEY (never commit it)}"

BITRATE="${BITRATE:-48k}"         # AAC-LC mono; ~18MB per 50 minutes
SEGMENT_SECONDS="${SEGMENT_SECONDS:-10}"
BUCKET=lessons

LESSON="" KIND="" PARTS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --lesson) LESSON="$2"; shift 2 ;;
    --kind)   KIND="$2";   shift 2 ;;
    -*) echo "unknown flag: $1" >&2; exit 2 ;;
    *)  PARTS+=("$1"); shift ;;
  esac
done
[[ -n "$LESSON" && -n "$KIND" && ${#PARTS[@]} -gt 0 ]] || {
  echo "usage: $0 --lesson <uuid> --kind full|summary part1.ogg [part2.ogg ...]" >&2; exit 2; }
[[ "$KIND" == "full" || "$KIND" == "summary" ]] || { echo "--kind must be full or summary" >&2; exit 2; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT     # also removes the plaintext key
mkdir -p "$WORK/out"

for p in "${PARTS[@]}"; do
  [[ -f "$p" ]] || { echo "missing part: $p" >&2; exit 1; }
  printf "file '%s'\n" "$(cd "$(dirname "$p")" && pwd)/$(basename "$p")" >> "$WORK/list.txt"
done
echo "==> ${#PARTS[@]} part(s), in the order given"

openssl rand 16 > "$WORK/enc.key"
IV="$(openssl rand -hex 16)"
# Line 1 is what lands in the playlist. The hls Edge Function rewrites it per
# session, so the placeholder host never has to resolve.
printf '%s\n%s\n%s\n' "https://key.placeholder/__TOKEN__" "$WORK/enc.key" "$IV" > "$WORK/keyinfo"

echo "==> concat + transcode + encrypt"
ffmpeg -nostdin -y -loglevel error -stats \
  -f concat -safe 0 -i "$WORK/list.txt" \
  -vn -ac 1 -ar 44100 -c:a aac -b:a "$BITRATE" \
  -f hls -hls_time "$SEGMENT_SECONDS" -hls_playlist_type vod -hls_list_size 0 \
  -hls_segment_type mpegts -hls_key_info_file "$WORK/keyinfo" \
  -hls_segment_filename "$WORK/out/seg%05d.ts" \
  "$WORK/out/index.m3u8"

# Paranoia: the key must never reach the bucket. -hls_key_info_file keeps it out
# (unlike -hls_enc, which writes it next to the segments), but check anyway.
if ls "$WORK/out" | grep -qiE '\.key$'; then
  echo "FATAL: a key file ended up in the output directory" >&2; exit 1
fi

# Sum the #EXTINF segment lengths instead of running ffprobe on the playlist:
# ffprobe would try to fetch the placeholder key URL and fail.
DURATION="$(awk -F'[:,]' '/^#EXTINF:/ { s += $2 } END { printf "%d", s }' "$WORK/out/index.m3u8")"
SEGMENTS="$(ls "$WORK/out"/*.ts | wc -l | tr -d ' ')"
PREFIX="$LESSON/$KIND"
echo "==> ${DURATION}s, ${SEGMENTS} segments -> $BUCKET/$PREFIX"

upload() {  # <local file> <remote path> <content-type>
  curl -sS -f -X POST "$SUPABASE_URL/storage/v1/object/$BUCKET/$2" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: $3" -H "x-upsert: true" \
    --data-binary "@$1" -o /dev/null
}
export -f upload; export SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY BUCKET

echo "==> uploading segments"
ls "$WORK/out"/*.ts | xargs -P 8 -I{} bash -c \
  'upload "{}" "'"$PREFIX"'/$(basename {})" video/mp2t'
upload "$WORK/out/index.m3u8" "$PREFIX/index.m3u8" application/vnd.apple.mpegurl

echo "==> registering track"
api() {  # <method> <path> <json>
  curl -sS -f -X "$1" "$SUPABASE_URL/rest/v1/$2" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates,return=representation" \
    -d "$3"
}

TRACK_JSON="$(api POST "tracks?on_conflict=lesson_id,kind" "$(python3 -c "
import json,sys
print(json.dumps({'lesson_id': sys.argv[1], 'kind': sys.argv[2], 'hls_prefix': sys.argv[3],
                  'duration_seconds': int(sys.argv[4]), 'segment_count': int(sys.argv[5]),
                  'status': 'ready'}))" "$LESSON" "$KIND" "$PREFIX" "$DURATION" "$SEGMENTS")")"
TRACK_ID="$(python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])" <<< "$TRACK_JSON")"

# bytea goes in as a \x hex literal.
KEY_HEX="$(xxd -p -c 32 "$WORK/enc.key")"
api POST "track_keys?on_conflict=track_id" "$(python3 -c "
import json,sys
print(json.dumps({'track_id': sys.argv[1], 'key_bytes': '\\\\x'+sys.argv[2], 'key_iv': sys.argv[3]}))" \
  "$TRACK_ID" "$KEY_HEX" "$IV")" > /dev/null

# Only a lesson waiting for its first recording goes live. A replaced
# recording must not un-hide a lesson Idit chose to hide.
api PATCH "lessons?id=eq.$LESSON&status=eq.processing" '{"status":"ready"}' > /dev/null

echo "==> done. track $TRACK_ID is ready."
