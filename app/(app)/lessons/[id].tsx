import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Appbar, Text, Chip, ActivityIndicator } from 'react-native-paper';
import { supabase } from '@/lib/supabase';
import { goBack } from '@/lib/navigation';
import BackAction from '@/components/BackAction';
import { useAuth } from '@/context/auth';
import LessonPlayer from '@/components/LessonPlayer';
import HeaderTitle from '@/components/HeaderTitle';
import { CATEGORY_ITEM, type Category } from '@/lib/categories';
import { colors } from '@/lib/theme';

type Track = { id: string; kind: 'full' | 'summary'; duration_seconds: number | null; status: string };
type Lesson = {
  id: string;
  lesson_number: number | null;
  title: string;
  description: string | null;
  lesson_date: string | null;
  is_free: boolean;
  category: Category;
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
        .select('id, lesson_number, title, description, lesson_date, is_free, category, tracks(id, kind, duration_seconds, status)')
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
          <BackAction onPress={() => goBack(router, '/(app)/lessons')} />
          <Appbar.Content title="שיעור" />
        </Appbar.Header>
        <Text style={styles.empty}>השיעור לא נמצא.</Text>
      </View>
    );
  }

  // Each catalogue item has one recording. Summaries used to be a second
  // track on a lesson; the migration moved them to items of their own.
  const track = (lesson.tracks ?? []).find((t) => t.status === 'ready');
  const label = CATEGORY_ITEM[lesson.category];
  const locked = !lesson.is_free && !hasAccess;

  return (
    <View style={styles.flex}>
      <Appbar.Header elevated>
        <BackAction onPress={() => goBack(router, '/(app)/lessons')} />
        <Appbar.Content
          title={(
            <HeaderTitle
              title={lesson.lesson_number ? `${label} ${lesson.lesson_number}` : label}
              subtitle={lesson.lesson_date
                ? new Date(lesson.lesson_date).toLocaleDateString('he-IL')
                : null}
            />
          )}
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

        {track
          ? <LessonPlayer trackId={track.id} title={lesson.title} />
          : <Text style={styles.empty}>עדיין אין הקלטה זמינה.</Text>}
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
  loader: { marginTop: 64 },
  empty: { textAlign: 'center', marginTop: 48, color: colors.textSecondary },
});
