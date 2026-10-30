import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter, Redirect } from 'expo-router';
import { Appbar, Card, Text, ActivityIndicator, Chip, Divider } from 'react-native-paper';
import { supabase } from '@/lib/supabase';
import { goBack } from '@/lib/navigation';
import { formatHebrewDate } from '@/lib/hebrewDate';
import BackAction from '@/components/BackAction';
import Tabs from '@/components/Tabs';
import { useAuth } from '@/context/auth';
import { CATEGORY_ITEM, type Category } from '@/lib/categories';
import { colors, appbarStyle } from '@/lib/theme';

type LessonStat = {
  lesson_id: string;
  category: Category;
  lesson_number: number | null;
  title: string;
  status: string;
  duration_seconds: number | null;
  listeners: number;
  finished: number;
  avg_percent: number;
  plays: number;
  last_listened_at: string | null;
};
type Listener = { username: string; percent: number; updated_at: string };
type Student = {
  username: string;
  has_access: boolean;
  lessons_started: number;
  lessons_finished: number;
  last_listened_at: string | null;
};

type View_ = 'lessons' | 'students';

// Everything here comes from admin-only database functions that aggregate
// playback_progress and playback_sessions; students' own listening data is
// never readable directly. Admins' listening is excluded from the numbers.
export default function Stats() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [view, setView] = useState<View_>('lessons');
  const [lessons, setLessons] = useState<LessonStat[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [listeners, setListeners] = useState<Record<string, Listener[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const [l, s] = await Promise.all([
      supabase.rpc('admin_lesson_stats'),
      supabase.rpc('admin_student_activity'),
    ]);
    setFailed(!!(l.error || s.error));
    setLessons((l.data as LessonStat[]) ?? []);
    setStudents((s.data as Student[]) ?? []);
    setListeners({});
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!isAdmin) return <Redirect href="/(app)/lessons" />;

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggle = async (lessonId: string) => {
    if (open === lessonId) { setOpen(null); return; }
    setOpen(lessonId);
    if (!listeners[lessonId]) {
      const { data } = await supabase.rpc('admin_lesson_listeners', { target_lesson: lessonId });
      setListeners((prev) => ({ ...prev, [lessonId]: (data as Listener[]) ?? [] }));
    }
  };

  const totalListeners = students.filter((s) => s.lessons_started > 0).length;
  const activeMonth = students.filter((s) =>
    s.last_listened_at && Date.now() - new Date(s.last_listened_at).getTime() < 30 * 86400_000).length;

  return (
    <View style={styles.flex}>
      <Appbar.Header style={appbarStyle}>
        <BackAction onPress={() => goBack(router, '/(app)/admin')} />
        <Appbar.Content title="סטטיסטיקות האזנה" />
        <Appbar.Action icon="refresh" onPress={onRefresh} />
      </Appbar.Header>

      {loading ? <ActivityIndicator style={styles.loader} size="large" /> : (
        <FlatList<LessonStat | Student>
          data={view === 'lessons' ? lessons : students}
          keyExtractor={(item) => ('lesson_id' in item ? item.lesson_id : item.username)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={styles.header}>
              {failed && <Text style={styles.error}>לא הצלחנו לטעון את הנתונים.</Text>}
              <View style={styles.row}>
                <Stat label="תלמידות" value={students.length} />
                <Stat label="האזינו פעם" value={totalListeners} />
                <Stat label="פעילות בחודש" value={activeMonth} />
              </View>
              <Tabs
                value={view}
                onValueChange={(v) => setView(v as View_)}
                buttons={[
                  { value: 'lessons', label: 'לפי שיעור' },
                  { value: 'students', label: 'לפי תלמידה' },
                ]}
              />
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>אין עדיין נתונים.</Text>}
          renderItem={({ item }) => ('lesson_id' in item
            ? (
              <LessonCard
                stat={item}
                open={open === item.lesson_id}
                listeners={listeners[item.lesson_id]}
                onPress={() => toggle(item.lesson_id)}
              />
            )
            : <StudentCard student={item} />)}
        />
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card mode="outlined" style={styles.stat}>
      <Card.Content>
        <Text variant="headlineSmall" style={styles.statValue}>{value}</Text>
        <Text variant="bodySmall" style={styles.statLabel}>{label}</Text>
      </Card.Content>
    </Card>
  );
}

function LessonCard({ stat, open, listeners, onPress }: {
  stat: LessonStat; open: boolean; listeners?: Listener[]; onPress: () => void;
}) {
  const name = `${CATEGORY_ITEM[stat.category]}${stat.lesson_number ? ` ${stat.lesson_number}` : ''}`;
  return (
    <Card mode="outlined" style={styles.card} onPress={stat.listeners > 0 ? onPress : undefined}>
      <Card.Title
        title={stat.title}
        titleNumberOfLines={2}
        subtitle={stat.last_listened_at
          ? `${name} · האזנה אחרונה ${formatHebrewDate(stat.last_listened_at)}`
          : name}
        right={() => (stat.status !== 'ready'
          ? <Chip compact icon="eye-off" style={styles.chip}>מוסתר</Chip>
          : null)}
      />
      <Card.Content style={styles.body}>
        <View style={styles.numbers}>
          <Number label="האזינו" value={stat.listeners} />
          <Number label="סיימו" value={stat.finished} />
          <Number label="הפעלות" value={stat.plays} />
        </View>
        {stat.listeners > 0 && (
          <>
            <Text variant="bodySmall" style={styles.muted}>
              בממוצע שמעו {stat.avg_percent}% מה{CATEGORY_ITEM[stat.category]}
            </Text>
            <Bar percent={stat.avg_percent} height={6} />
            <Text variant="bodySmall" style={styles.link}>{open ? 'הסתרת הרשימה' : 'מי האזינה'}</Text>
          </>
        )}
        {open && (
          <View style={styles.listeners}>
            <Divider />
            {!listeners ? <ActivityIndicator style={styles.small} /> : listeners.map((l) => (
              <View key={l.username} style={styles.listener}>
                <View style={styles.listenerRow}>
                  <Text variant="bodyMedium">{l.username}</Text>
                  <Text variant="bodySmall" style={styles.muted}>
                    {l.percent}% · {formatHebrewDate(l.updated_at)}
                  </Text>
                </View>
                <Bar percent={l.percent} height={4} />
              </View>
            ))}
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

function StudentCard({ student }: { student: Student }) {
  const days = student.last_listened_at
    ? Math.floor((Date.now() - new Date(student.last_listened_at).getTime()) / 86400_000)
    : null;
  return (
    <Card mode="outlined" style={styles.card}>
      <Card.Title
        title={student.username}
        subtitle={days === null
          ? 'עוד לא האזינה'
          : days === 0 ? 'האזינה היום' : `האזנה אחרונה ${formatHebrewDate(student.last_listened_at!)}`}
        right={() => (student.has_access
          ? <Chip compact icon="check" style={styles.chip}>עם גישה</Chip>
          : <Chip compact icon="lock" style={styles.chip}>בלי גישה</Chip>)}
      />
      <Card.Content style={styles.numbers}>
        <Number label="התחילה" value={student.lessons_started} />
        <Number label="סיימה" value={student.lessons_finished} />
      </Card.Content>
    </Card>
  );
}

// Paper's ProgressBar reserved far more height than it drew on web, which
// pushed the listener list down behind the next card. A plain bar is enough.
function Bar({ percent, height }: { percent: number; height: number }) {
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, percent))}%`, borderRadius: height / 2 }]} />
    </View>
  );
}

function Number({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.number}>
      <Text variant="titleMedium" style={styles.numberValue}>{value}</Text>
      <Text variant="bodySmall" style={styles.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 16, gap: 12, paddingBottom: 48 },
  header: { gap: 12, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: 14 },
  statValue: { color: colors.primary, textAlign: 'center' },
  statLabel: { color: colors.textSecondary, textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: 16 },
  chip: { marginEnd: 12 },
  body: { gap: 6 },
  numbers: { flexDirection: 'row', gap: 24, paddingBottom: 4 },
  number: { alignItems: 'center', minWidth: 48 },
  numberValue: { color: colors.primary },
  muted: { color: colors.textSecondary },
  track: { backgroundColor: colors.outline, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary },
  link: { color: colors.primary, marginTop: 4 },
  listeners: { gap: 10, marginTop: 4 },
  listener: { gap: 4 },
  listenerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  error: { color: colors.error, textAlign: 'center' },
  empty: { textAlign: 'center', marginTop: 48, color: colors.textSecondary },
  loader: { marginTop: 64 },
  small: { marginVertical: 8 },
});
