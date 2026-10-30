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
import { Text, IconButton, Button, Surface, ActivityIndicator } from 'react-native-paper';
import RatePicker from '@/components/RatePicker';
import Slider from '@react-native-community/slider';
import {
  startPlaybackSession, loadProgress, saveProgress, formatTime, NoAccessError,
} from '@/lib/playback';
import { APP_NAME, colors, WHATSAPP_URL } from '@/lib/theme';

const RATES = ['1', '1.25', '1.5'];
const PROGRESS_SAVE_INTERVAL_MS = 10_000;

export default function LessonPlayer({ trackId, title }: { trackId: string; title: string }) {
  const [manifestUrl, setManifestUrl] = useState<string | null>(null);
  const [resumeAt, setResumeAt] = useState(0);
  const [error, setError] = useState<'no_access' | 'failed' | null>(null);
  const [rate, setRate] = useState('1');
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  // Where a seek is headed. Between releasing the slider and the player
  // reporting the new time, status.currentTime is still the old position, and
  // the thumb snapped back to it for a moment before jumping forward.
  const [seekingTo, setSeekingTo] = useState<number | null>(null);

  const player = useAudioPlayer(manifestUrl ? { uri: manifestUrl } : null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const lastSaved = useRef(0);
  const didSeekToResume = useRef(false);
  const currentTime = useRef(0);
  currentTime.current = status.currentTime ?? 0;

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

  // Release the pending seek once the player has caught up with it, or after
  // a moment if it never reports a time close enough (e.g. at the very end).
  useEffect(() => {
    if (seekingTo === null) return;
    if (Math.abs((status.currentTime ?? 0) - seekingTo) < 1.5) { setSeekingTo(null); return; }
    const t = setTimeout(() => setSeekingTo(null), 2000);
    return () => clearTimeout(t);
  }, [seekingTo, status.currentTime]);

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

  // Persist on unmount so closing mid-lesson is not lost. Reads the time from
  // a ref: with currentTime as a dependency this cleanup ran on every status
  // update and saved progress twice a second.
  useEffect(() => () => {
    if (currentTime.current > 0) saveProgress(trackId, currentTime.current).catch(() => {});
  }, [trackId]);

  // The media notification (pull-down shade) and lock-screen controls, with
  // position, play/pause and skip, as podcast apps have. On Android this also
  // keeps playback alive in the background past the OS's ~3 minute limit.
  useEffect(() => {
    if (!status.isLoaded) return;
    player.setActiveForLockScreen(
      true,
      { title, artist: APP_NAME },
      { showSeekForward: true, showSeekBackward: true },
    );
  }, [status.isLoaded, player, title]);
  useEffect(() => () => {
    try { player.clearLockScreenControls(); } catch { /* already released */ }
  }, [player]);

  const changeRate = useCallback((r: string) => {
    setRate(r);
    player.setPlaybackRate(Number(r));
  }, [player]);

  if (error === 'no_access') {
    return (
      <Surface style={styles.card} elevation={0}>
        <Text variant="titleMedium" style={styles.locked}>השיעור הזה נעול</Text>
        <Text variant="bodyMedium" style={styles.lockedBody}>
          לפתיחת גישה אפשר לפנות לעידית בוואטסאפ.
        </Text>
        <Button mode="contained" icon="whatsapp" onPress={() => Linking.openURL(WHATSAPP_URL)}>
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
  if (!manifestUrl || !status.isLoaded) {
    return (
      <Surface style={styles.card} elevation={0}>
        <ActivityIndicator />
        <Text variant="bodySmall" style={styles.loadingText}>טוען את השיעור…</Text>
      </Surface>
    );
  }

  const duration = status.duration ?? 0;
  const position = scrubbing ?? seekingTo ?? status.currentTime ?? 0;

  const seek = (to: number) => {
    const target = Math.max(0, Math.min(duration, to));
    setSeekingTo(target);
    player.seekTo(target);
  };

  return (
    <Surface style={styles.card} elevation={0}>

      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={duration || 1}
        value={position}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.outline}
        thumbTintColor={colors.primary}
        onValueChange={setScrubbing}
        onSlidingComplete={(v) => { seek(v); setScrubbing(null); }}
      />
      <View style={styles.times}>
        <Text variant="bodySmall">{formatTime(position)}</Text>
        <Text variant="bodySmall">{formatTime(duration)}</Text>
      </View>

      <View style={styles.controls}>
        <IconButton icon="rewind-15" size={30} onPress={() => seek(position - 15)} />
        <IconButton
          icon={status.playing ? 'pause-circle' : 'play-circle'}
          size={58}
          iconColor={colors.primary}
          onPress={() => (status.playing ? player.pause() : player.play())}
        />
        <IconButton icon="fast-forward-30" size={30} onPress={() => seek(position + 30)} />
      </View>

      <RatePicker value={rate} rates={RATES} onChange={changeRate} />
      {status.isBuffering && <Text variant="bodySmall" style={styles.buffering}>טוען…</Text>}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12, padding: 20, gap: 12, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.outline,
  },
  slider: { width: '100%', height: 36 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  locked: { color: colors.primary },
  lockedBody: { color: colors.textSecondary, marginBottom: 6 },
  loadingText: { textAlign: 'center', color: colors.textSecondary },
  buffering: { textAlign: 'center', color: colors.textSecondary },
});
