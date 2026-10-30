/**
 * Web player. expo-audio's web backend is a bare <audio> element, which plays
 * HLS only in Safari, so Chrome/Firefox/Edge need hls.js driving MSE. Safari
 * still takes the native path -- loading hls.js there would fight AVPlayer.
 *
 * Note this surface is far easier to defeat than the native one: the AES key is
 * a plain GET and is visible in devtools. That trade-off was accepted
 * deliberately -- see README.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, IconButton, Button, Surface, ActivityIndicator } from 'react-native-paper';
import RatePicker from '@/components/RatePicker';
import Hls from 'hls.js';
import {
  startPlaybackSession, loadProgress, saveProgress, formatTime, NoAccessError,
} from '@/lib/playback';
import { colors, WHATSAPP_URL } from '@/lib/theme';

const RATES = ['1', '1.25', '1.5'];
const PROGRESS_SAVE_INTERVAL_MS = 10_000;

export default function LessonPlayer({ trackId, title }: { trackId: string; title: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastSaved = useRef(0);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState('1');
  const [error, setError] = useState<'no_access' | 'failed' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [session, progress] = await Promise.all([
          startPlaybackSession(trackId),
          loadProgress(trackId),
        ]);
        if (cancelled) return;

        const audio = audioRef.current;
        if (!audio) return;

        const onReady = () => {
          if (progress > 5) audio.currentTime = progress;
          setReady(true);
        };

        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true });
          hlsRef.current = hls;
          hls.loadSource(session.manifestUrl);
          hls.attachMedia(audio);
          hls.on(Hls.Events.MANIFEST_PARSED, onReady);
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) setError('failed');
          });
        } else {
          // Safari / iOS WebKit play HLS natively.
          audio.src = session.manifestUrl;
          audio.addEventListener('loadedmetadata', onReady, { once: true });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof NoAccessError ? 'no_access' : 'failed');
      }
    })();

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [trackId]);

  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setPosition(audio.currentTime);
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);

    const now = Date.now();
    if (!audio.paused && now - lastSaved.current > PROGRESS_SAVE_INTERVAL_MS) {
      lastSaved.current = now;
      saveProgress(trackId, audio.currentTime).catch(() => {});
    }
  }, [trackId]);

  useEffect(() => () => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 0) saveProgress(trackId, audio.currentTime).catch(() => {});
  }, [trackId]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) { audio.play(); setPlaying(true); }
    else { audio.pause(); setPlaying(false); }
  };

  const seek = (to: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const target = Math.max(0, Math.min(duration || 0, to));
    audio.currentTime = target;
    // Move the bar now: the next timeupdate can still carry the old time, and
    // the thumb snapped back to it for a moment.
    setPosition(target);
  };

  const changeRate = (r: string) => {
    setRate(r);
    if (audioRef.current) audioRef.current.playbackRate = Number(r);
  };

  if (error === 'no_access') {
    return (
      <Surface style={styles.card} elevation={0}>
        <Text variant="titleMedium" style={styles.locked}>השיעור הזה נעול</Text>
        <Text variant="bodyMedium" style={styles.lockedBody}>
          לפתיחת גישה אפשר לפנות לעידית בוואטסאפ.
        </Text>
        <Button mode="contained" icon="whatsapp" onPress={() => window.open(WHATSAPP_URL, '_blank')}>
          פנייה לעידית
        </Button>
      </Surface>
    );
  }
  if (error === 'failed') {
    return (
      <Surface style={styles.card} elevation={0}>
        <Text variant="bodyMedium">לא הצלחנו לטעון את השיעור. כדאי לנסות שוב.</Text>
      </Surface>
    );
  }

  return (
    <Surface style={styles.card} elevation={0}>
      {/* Raw DOM element: this file only ever runs under React DOM. */}
      <audio
        ref={audioRef}
        onTimeUpdate={onTimeUpdate}
        onEnded={() => setPlaying(false)}
        style={{ display: 'none' }}
      />

      {!ready ? (
        <>
          <ActivityIndicator />
          <Text variant="bodySmall" style={styles.loadingText}>טוען את השיעור…</Text>
        </>
      ) : (
        <>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={1}
            value={position}
            onChange={(e) => seek(Number(e.target.value))}
            style={{ width: '100%', accentColor: colors.primary, direction: 'ltr' }}
          />
          <View style={styles.times}>
            <Text variant="bodySmall">{formatTime(position)}</Text>
            <Text variant="bodySmall">{formatTime(duration)}</Text>
          </View>

          <View style={styles.controls}>
            <IconButton icon="rewind-15" size={30} onPress={() => seek(position - 15)} />
            <IconButton
              icon={playing ? 'pause-circle' : 'play-circle'}
              size={58}
              iconColor={colors.primary}
              onPress={toggle}
            />
            <IconButton icon="fast-forward-30" size={30} onPress={() => seek(position + 30)} />
          </View>

          <RatePicker value={rate} rates={RATES} onChange={changeRate} />
        </>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12, padding: 20, gap: 12, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.outline,
  },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  locked: { color: colors.primary },
  lockedBody: { color: colors.textSecondary, marginBottom: 6 },
  loadingText: { textAlign: 'center', color: colors.textSecondary },
});
