/**
 * Native player. expo-audio streams the AES-128 encrypted HLS directly:
 * ExoPlayer fetches the key once, decrypts segments as it goes, and keeps
 * playing with the screen off. Verified on a real device before this was built.
 *
 * The web build uses LessonPlayer.web.tsx instead -- expo-audio's web backend
 * is a plain <audio> element, which cannot play HLS outside Safari.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Text, IconButton, Button, Surface, ActivityIndicator, SegmentedButtons } from 'react-native-paper';
import Slider from '@react-native-community/slider';
import {
  startPlaybackSession, loadProgress, saveProgress, formatTime, NoAccessError,
} from '@/lib/playback';
import { colors, WHATSAPP_URL } from '@/lib/theme';

const RATES = ['1', '1.25', '1.5'];
const PROGRESS_SAVE_INTERVAL_MS = 10_000;

export default function LessonPlayer({ trackId, title }: { trackId: string; title: string }) {
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);
  const [resumeAt, setResumeAt] = useState(0);
  const [error, setError] = useState<'no_access' | 'failed' | null>(null);
  const [rate, setRate] = useState('1');
  const [scrubbing, setScrubbing] = useState<number | null>(null);

  const player = useAudioPlayer(manifestUrl ? { uri: manifestUrl } : null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const lastSaved = useRef(0);
  const didSeekToResume = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [session, progress] = await Promise.all([
          startPlaybackSession(trackId),
          loadProgress(trackId),
        ]);
        if (cancelled) return;
        setResumeAt(progress);
        setManifestUrl(session.manifestUrl);
      } catch (e) {
        if (!cancelled) setError(e instanceof NoAccessError ? 'no_access' : 'failed');
      }
    })();
    return () => { cancelled = true; };
  }, [trackId]);

  // Jump to the saved position once, after the manifest has actually loaded --
  // seeking before that is silently dropped.
  useEffect(() => {
    if (status.isLoaded && resumeAt > 5 && !didSeekToResume.current) {
      didSeekToResume.current = true;
      player.seekTo(resumeAt);
    }
  }, [status.isLoaded, resumeAt, player]);

  useEffect(() => {
    const now = Date.now();
    if (status.playing && now - lastSaved.current > PROGRESS_SAVE_INTERVAL_MS) {
      lastSaved.current = now;
      saveProgress(trackId, status.currentTime).catch(() => {});
    }
  }, [status.playing, status.currentTime, trackId]);

  // Persist on unmount so closing mid-lesson is not lost.
  useEffect(() => () => {
    if (status.currentTime > 0) saveProgress(trackId, status.currentTime).catch(() => {});
  }, [trackId, status.currentTime]);

  const changeRate = useCallback((r: string) => {
    setRate(r);
    player.setPlaybackRate(Number(r));
  }, [player]);

  if (error === 'no_access') {
    return (
      <Surface style={styles.card} elevation={1}>
        <Text variant="titleMedium" style={styles.locked}>השיעור הזה נעול</Text>
        <Text variant="bodyMedium" style={styles.lockedBody}>
          לפתיחת גישה אפשר לפנות לעידית בוואטסאפ. הגישה ניתנת לשנה.
        </Text>
        <Button mode="contained" icon="whatsapp" onPress={() => Linking.openURL(WHATSAPP_URL)}>
          פנייה לעידית
        </Button>
      </Surface>
    );
  }
  if (error === 'failed') {
    return (
      <Surface style={styles.card} elevation={1}>
        <Text variant="bodyMedium">לא הצלחנו לטעון את השיעור. כדאי לנסות שוב.</Text>
      </Surface>
    );
  }
  if (!manifestUrl || !status.isLoaded) {
    return (
      <Surface style={styles.card} elevation={1}>
        <ActivityIndicator />
        <Text variant="bodySmall" style={styles.loadingText}>טוען את השיעור…</Text>
      </Surface>
    );
  }

  const duration = status.duration ?? 0;
  const position = scrubbing ?? status.currentTime ?? 0;

  return (
    <Surface style={styles.card} elevation={1}>
      <Text variant="titleMedium" numberOfLines={1}>{title}</Text>

      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={duration || 1}
        value={position}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.outline}
        thumbTintColor={colors.primary}
        onValueChange={setScrubbing}
        onSlidingComplete={(v) => { setScrubbing(null); player.seekTo(v); }}
      />
      <View style={styles.times}>
        <Text variant="bodySmall">{formatTime(position)}</Text>
        <Text variant="bodySmall">{formatTime(duration)}</Text>
      </View>

      <View style={styles.controls}>
        <IconButton icon="rewind-15" size={30} onPress={() => player.seekTo(Math.max(0, position - 15))} />
        <IconButton
          icon={status.playing ? 'pause-circle' : 'play-circle'}
          size={58}
          iconColor={colors.primary}
          onPress={() => (status.playing ? player.pause() : player.play())}
        />
        <IconButton icon="fast-forward-30" size={30} onPress={() => player.seekTo(Math.min(duration, position + 30))} />
      </View>

      <SegmentedButtons
        value={rate}
        onValueChange={changeRate}
        density="small"
        buttons={RATES.map((r) => ({ value: r, label: `${r}x` }))}
      />
      {status.isBuffering && <Text variant="bodySmall" style={styles.buffering}>טוען…</Text>}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 10, backgroundColor: colors.surface },
  slider: { width: '100%', height: 36 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  locked: { color: colors.primary },
  lockedBody: { color: colors.textSecondary, marginBottom: 6 },
  loadingText: { textAlign: 'center', color: colors.textSecondary },
  buffering: { textAlign: 'center', color: colors.textSecondary },
});
