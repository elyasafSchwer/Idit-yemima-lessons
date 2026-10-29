import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Appbar, Text, Chip, ActivityIndicator, Divider } from 'react-native-paper';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import LessonPlayer from '@/components/LessonPlayer';
import { colors } from '@/lib/theme';

type Track = { id: string; kind: 'full' | 'summary'; duration_seconds: number | null; status: string };
type Lesson = {
  id: string;
  lesson_number: number | null;
  title: string;
  description: string | null;
  lesson_date: string | null;
  is_free: boolean;
  tracks: Track[];
};

export default function LessonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { hasAccess } = useAuth();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('lessons')
        .select('id, lesson_number, title, description, lesson_date, is_free, tracks(id, kind, duration_seconds, status)')
        .eq('id', id)
        .single();
      if (!cancelled) {
        setLesson(data as Lesson | null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]));

  if (loading) {
    return <ActivityIndicator style={styles.loader} size="large" />;
  }
  if (!lesson) {
    return (
      <View style={styles.flex}>
        <Appbar.Header elevated>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="שיעור" />
        </Appbar.Header>
        <Text style={styles.empty}>השיעור לא נמצא.</Text>
      </View>
    );
  }

  const ready = (lesson.tracks ?? []).filter((t) => t.status === 'ready');
  const full = ready.find((t) => t.kind === 'full');
  const summary = ready.find((t) => t.kind === 'summary');
  const locked = !lesson.is_free && !hasAccess;

  return (
    <View style={styles.flex}>
      <Appbar.Header elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title={lesson.lesson_number ? `שיעור ${lesson.lesson_number}` : 'שיעור'}
          subtitle={lesson.lesson_date
            ? new Date(lesson.lesson_date).toLocaleDateString('he-IL')
            : undefined}
        />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.titleRow}>
          <Text variant="headlineSmall" style={styles.title}>{lesson.title}</Text>
          {lesson.is_free && <Chip compact>פתוח</Chip>}
          {locked && <Chip compact icon="lock">נעול</Chip>}
        </View>

        {lesson.description && (
          <Text variant="bodyMedium" style={styles.description}>{lesson.description}</Text>
        )}

        {full && (
          <>
            <Text variant="titleSmall" style={styles.sectionLabel}>השיעור</Text>
            <LessonPlayer trackId={full.id} title={lesson.title} />
          </>
        )}

        {summary && (
          <>
            <Divider style={styles.divider} />
            <Text variant="titleSmall" style={styles.sectionLabel}>סיכום השיעור</Text>
            <LessonPlayer trackId={summary.id} title={`סיכום — ${lesson.title}`} />
          </>
        )}

        {!full && !summary && (
          <Text style={styles.empty}>עדיין אין הקלטה זמינה לשיעור הזה.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  wrap: { padding: 16, gap: 12, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { color: colors.text, flexShrink: 1 },
  description: { color: colors.textSecondary },
  sectionLabel: { color: colors.primary, marginTop: 8 },
  divider: { marginVertical: 12 },
  loader: { marginTop: 64 },
  empty: { textAlign: 'center', marginTop: 48, color: colors.textSecondary },
});
