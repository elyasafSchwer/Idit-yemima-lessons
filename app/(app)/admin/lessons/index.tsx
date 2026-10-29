import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter, Redirect } from 'expo-router';
import {
  Appbar, Card, Text, Button, ActivityIndicator, Snackbar, Divider, SegmentedButtons,
} from 'react-native-paper';
import { supabase } from '@/lib/supabase';
import Toggle from '@/components/Toggle';
import { goBack } from '@/lib/navigation';
import BackAction from '@/components/BackAction';
import { useAuth } from '@/context/auth';
import { retryIngest } from '@/lib/ingest';
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_ITEM, type Category } from '@/lib/categories';
import { colors } from '@/lib/theme';

type Job = { id: string; status: string; error: string | null; created_at: string };
type Track = { status: string; duration_seconds: number | null };
type Lesson = {
  id: string;
  lesson_number: number | null;
  title: string;
  lesson_date: string | null;
  is_free: boolean;
  status: string;
  category: Category;
  tracks: Track[];
  ingest_jobs: Job[];
};

type RecordingState =
  | { state: 'ready'; minutes: number | null }
  | { state: 'processing' }
  | { state: 'failed'; job: Job }
  | { state: 'missing' };

// The newest job decides: a fresh upload that failed matters more than an
// older recording that is still live, because Idit has to act on it.
function recordingState(lesson: Lesson): RecordingState {
  const latest = [...lesson.ingest_jobs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (latest?.status === 'processing') return { state: 'processing' };
  if (latest?.status === 'failed') return { state: 'failed', job: latest };
  const track = lesson.tracks.find((t) => t.status === 'ready');
  if (track) {
    return { state: 'ready', minutes: track.duration_seconds ? Math.round(track.duration_seconds / 60) : null };
  }
  return { state: 'missing' };
}

export default function ManageLessons() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [category, setCategory] = useState<Category>('lesson');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('lessons')
      .select('id, lesson_number, title, lesson_date, is_free, status, category, '
        + 'tracks(status, duration_seconds), ingest_jobs(id, status, error, created_at)')
      .order('lesson_number', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    setLessons((data as unknown as Lesson[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Processing takes a minute or two on the runner; keep the screen honest
  // without making Idit pull to refresh.
  const anyProcessing = lessons.some((l) => recordingState(l).state === 'processing');
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

  const update = async (lesson: Lesson, patch: Partial<Pick<Lesson, 'status' | 'is_free'>>, done: string) => {
    setBusy(lesson.id);
    const { error } = await supabase.from('lessons').update(patch).eq('id', lesson.id);
    setBusy(null);
    setToast(error ? 'הפעולה נכשלה' : done);
    load();
  };

  const retry = async (lesson: Lesson, job: Job) => {
    setBusy(lesson.id);
    const { error } = await retryIngest(job.id, lesson.id, 'full');
    setBusy(null);
    setToast(error ? 'לא הצלחנו להפעיל את העיבוד שוב' : 'העיבוד הופעל מחדש');
    load();
  };

  const upload = (lesson: Lesson) =>
    router.push({ pathname: '/(app)/admin/lessons/new', params: { lessonId: lesson.id } });

  const item = CATEGORY_ITEM[category];

  return (
    <View style={styles.flex}>
      <Appbar.Header elevated>
        <BackAction onPress={() => goBack(router, '/(app)/admin')} />
        <Appbar.Content title="ניהול שיעורים" />
        <Appbar.Action icon="refresh" onPress={onRefresh} />
      </Appbar.Header>

      {loading ? <ActivityIndicator style={styles.loader} size="large" /> : (
        <FlatList
          data={lessons.filter((l) => l.category === category)}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <SegmentedButtons
                value={category}
                onValueChange={(v) => setCategory(v as Category)}
                buttons={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
              />
              <Button
                mode="contained" icon="plus" style={styles.newButton}
                onPress={() => router.push({ pathname: '/(app)/admin/lessons/new', params: { category } })}
              >
                {category === 'summary' ? 'סיכום חדש' : 'שיעור חדש'}
              </Button>
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>עדיין אין כאן כלום.</Text>}
          renderItem={({ item: lesson }) => {
            const s = recordingState(lesson);
            const visible = lesson.status === 'ready';
            const disabled = busy === lesson.id;
            return (
              <Card style={styles.card}>
                <Card.Title
                  title={lesson.lesson_number ? `${lesson.lesson_number}. ${lesson.title}` : lesson.title}
                  titleNumberOfLines={2}
                  subtitle={lesson.lesson_date ? new Date(lesson.lesson_date).toLocaleDateString('he-IL') : undefined}
                />
                <Divider />
                <Card.Content style={styles.body}>
                  <View style={styles.row}>
                    <View style={styles.info}>
                      <Text variant="titleSmall">הקלטה</Text>
                      <RecordingStatus s={s} />
                    </View>
                    {s.state === 'failed' && (
                      <Button
                        mode="contained" icon="refresh" compact buttonColor={colors.error}
                        loading={disabled} disabled={!!busy}
                        onPress={() => retry(lesson, s.job)}
                      >
                        נסי שוב
                      </Button>
                    )}
                    {s.state === 'missing' && (
                      <Button mode="outlined" icon="upload" compact onPress={() => upload(lesson)}>
                        העלאת הקלטה
                      </Button>
                    )}
                    {s.state === 'ready' && (
                      <Button mode="text" icon="swap-horizontal" compact onPress={() => upload(lesson)}>
                        החלפה
                      </Button>
                    )}
                  </View>

                  {/* Hiding keeps the recording; it just takes the item out of
                      the students' catalogue. Only a processed item can be shown. */}
                  <View style={styles.row}>
                    <View style={styles.info}>
                      <Text variant="titleSmall">מופיע לתלמידות</Text>
                      {s.state !== 'ready' && !visible && (
                        <Text style={styles.muted}>יופיע אחרי שההקלטה תהיה מוכנה</Text>
                      )}
                    </View>
                    <Toggle
                      value={visible}
                      disabled={disabled || (!visible && s.state !== 'ready')}
                      onValueChange={(on) => update(
                        lesson,
                        { status: on ? 'ready' : 'draft' },
                        on ? `ה${item} מופיע לתלמידות` : `ה${item} הוסתר`,
                      )}
                    />
                  </View>

                  <View style={styles.row}>
                    <View style={styles.info}>
                      <Text variant="titleSmall">פתוח לכולן בחינם</Text>
                      <Text style={styles.muted}>
                        {lesson.is_free ? 'גם בלי הרשאה' : 'רק לתלמידות עם הרשאה'}
                      </Text>
                    </View>
                    <Toggle
                      value={lesson.is_free}
                      disabled={disabled}
                      onValueChange={(on) => update(
                        lesson,
                        { is_free: on },
                        on ? 'פתוח לכולן' : 'רק לתלמידות עם הרשאה',
                      )}
                    />
                  </View>
                </Card.Content>
              </Card>
            );
          }}
        />
      )}

      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3000}>
        {toast}
      </Snackbar>
    </View>
  );
}

function RecordingStatus({ s }: { s: RecordingState }) {
  switch (s.state) {
    case 'ready':
      return <Text style={styles.ok}>מוכנה{s.minutes ? ` · ${s.minutes} דק׳` : ''}</Text>;
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
      return <Text style={styles.muted}>לא הועלתה</Text>;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 12, paddingBottom: 48 },
  header: { gap: 12, marginBottom: 4 },
  newButton: { borderRadius: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 16 },
  body: { paddingTop: 8, gap: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 52, gap: 8,
  },
  info: { flex: 1, gap: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ok: { color: colors.primary },
  muted: { color: colors.textSecondary },
  failed: { color: colors.error },
  empty: { textAlign: 'center', marginTop: 48, color: colors.textSecondary },
  loader: { marginTop: 64 },
});
