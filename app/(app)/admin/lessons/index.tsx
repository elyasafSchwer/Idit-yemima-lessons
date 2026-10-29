import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter, Redirect } from 'expo-router';
import {
  Appbar, Card, Text, Button, Chip, ActivityIndicator, Snackbar, Divider,
} from 'react-native-paper';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { retryIngest, type TrackKind } from '@/lib/ingest';
import { colors } from '@/lib/theme';

type Job = { id: string; kind: TrackKind; status: string; error: string | null; created_at: string };
type Track = { kind: TrackKind; status: string; duration_seconds: number | null };
type Lesson = {
  id: string;
  lesson_number: number | null;
  title: string;
  lesson_date: string | null;
  is_free: boolean;
  status: string;
  tracks: Track[];
  ingest_jobs: Job[];
};

type TrackState =
  | { state: 'ready'; minutes: number | null }
  | { state: 'processing' }
  | { state: 'failed'; job: Job }
  | { state: 'missing' };

// The newest job decides: a fresh upload that failed matters more than an
// older track that is still live, because Idit has to act on it.
function trackState(lesson: Lesson, kind: TrackKind): TrackState {
  const latest = lesson.ingest_jobs
    .filter((j) => j.kind === kind)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (latest?.status === 'processing') return { state: 'processing' };
  if (latest?.status === 'failed') return { state: 'failed', job: latest };
  const track = lesson.tracks.find((t) => t.kind === kind && t.status === 'ready');
  if (track) {
    return { state: 'ready', minutes: track.duration_seconds ? Math.round(track.duration_seconds / 60) : null };
  }
  return { state: 'missing' };
}

const KIND_LABEL: Record<TrackKind, string> = { full: 'השיעור', summary: 'סיכום' };

export default function ManageLessons() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('lessons')
      .select('id, lesson_number, title, lesson_date, is_free, status, '
        + 'tracks(kind, status, duration_seconds), ingest_jobs(id, kind, status, error, created_at)')
      .order('lesson_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    setLessons((data as unknown as Lesson[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Processing takes a minute or two on the runner; keep the screen honest
  // without making Idit pull to refresh.
  const anyProcessing = lessons.some((l) =>
    (['full', 'summary'] as const).some((k) => trackState(l, k).state === 'processing'));
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [anyProcessing, load]);

  if (!isAdmin) return <Redirect href="/(app)/lessons" />;

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const retry = async (lesson: Lesson, job: Job) => {
    setBusy(job.id);
    const { error } = await retryIngest(job.id, lesson.id, job.kind);
    setBusy(null);
    setToast(error ? 'לא הצלחנו להפעיל את העיבוד שוב' : 'העיבוד הופעל מחדש');
    load();
  };

  const upload = (lesson: Lesson, kind: TrackKind) =>
    router.push({ pathname: '/(app)/admin/lessons/new', params: { lessonId: lesson.id, kind } });

  return (
    <View style={styles.flex}>
      <Appbar.Header elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="ניהול שיעורים" />
        <Appbar.Action icon="refresh" onPress={onRefresh} />
      </Appbar.Header>

      {loading ? <ActivityIndicator style={styles.loader} size="large" /> : (
        <FlatList
          data={lessons}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <Button
              mode="contained" icon="plus" style={styles.newButton}
              onPress={() => router.push('/(app)/admin/lessons/new')}
            >
              שיעור חדש
            </Button>
          }
          ListEmptyComponent={<Text style={styles.empty}>עדיין אין שיעורים.</Text>}
          renderItem={({ item }) => (
            <Card style={styles.card}>
              <Card.Title
                title={item.lesson_number ? `${item.lesson_number}. ${item.title}` : item.title}
                subtitle={item.lesson_date ? new Date(item.lesson_date).toLocaleDateString('he-IL') : undefined}
                right={() => (
                  <View style={styles.chips}>
                    {item.is_free && <Chip compact>פתוח</Chip>}
                    {item.status === 'ready'
                      ? <Chip compact icon="eye">מופיע לתלמידות</Chip>
                      : <Chip compact icon="eye-off">לא מופיע</Chip>}
                  </View>
                )}
              />
              <Divider />
              <Card.Content style={styles.tracks}>
                {(['full', 'summary'] as const).map((kind) => {
                  const s = trackState(item, kind);
                  return (
                    <View key={kind} style={styles.trackRow}>
                      <View style={styles.trackInfo}>
                        <Text variant="titleSmall">{KIND_LABEL[kind]}</Text>
                        <TrackStatus s={s} />
                      </View>
                      {s.state === 'failed' && (
                        <Button
                          mode="contained" icon="refresh" compact
                          buttonColor={colors.error}
                          loading={busy === s.job.id} disabled={!!busy}
                          onPress={() => retry(item, s.job)}
                        >
                          נסי שוב
                        </Button>
                      )}
                      {s.state === 'missing' && (
                        <Button mode="outlined" icon="upload" compact onPress={() => upload(item, kind)}>
                          {kind === 'summary' ? 'העלאת סיכום' : 'העלאת הקלטה'}
                        </Button>
                      )}
                      {s.state === 'ready' && (
                        <Button mode="text" icon="swap-horizontal" compact onPress={() => upload(item, kind)}>
                          החלפה
                        </Button>
                      )}
                    </View>
                  );
                })}
              </Card.Content>
            </Card>
          )}
        />
      )}

      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3000}>
        {toast}
      </Snackbar>
    </View>
  );
}

function TrackStatus({ s }: { s: TrackState }) {
  switch (s.state) {
    case 'ready':
      return <Text style={styles.ok}>זמין{s.minutes ? ` · ${s.minutes} דק׳` : ''}</Text>;
    case 'processing':
      return (
        <View style={styles.inline}>
          <ActivityIndicator size={12} />
          <Text style={styles.muted}>בעיבוד, זה לוקח כמה דקות</Text>
        </View>
      );
    case 'failed':
      return <Text style={styles.failed}>העיבוד נכשל</Text>;
    case 'missing':
      return <Text style={styles.muted}>לא הועלה</Text>;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 12, paddingBottom: 48 },
  newButton: { borderRadius: 12, marginBottom: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 16 },
  chips: { flexDirection: 'row', gap: 6, marginEnd: 12 },
  tracks: { paddingTop: 8, gap: 4 },
  trackRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 48, gap: 8,
  },
  trackInfo: { flex: 1, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ok: { color: colors.primary },
  muted: { color: colors.textSecondary },
  failed: { color: colors.error },
  empty: { textAlign: 'center', marginTop: 48, color: colors.textSecondary },
  loader: { marginTop: 64 },
});
