import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Appbar, Text, ActivityIndicator } from 'react-native-paper';
import { supabase } from '@/lib/supabase';
import { formatHebrewDate, gematria } from '@/lib/hebrewDate';
import { goBack } from '@/lib/navigation';
import BackAction from '@/components/BackAction';
import { useAuth } from '@/context/auth';
import LessonPlayer from '@/components/LessonPlayer';
import { CATEGORY_ITEM, CATEGORY_LABEL, type Category } from '@/lib/categories';
import { colors, fonts, appbarStyle } from '@/lib/theme';

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
        <Appbar.Header style={appbarStyle}>
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
      <Appbar.Header style={appbarStyle}>
        <BackAction onPress={() => goBack(router, '/(app)/lessons')} />
        <Appbar.Content title={CATEGORY_LABEL[lesson.category]} titleStyle={styles.barTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.wrap}>
        {/* A title page, as in a sefer: the numeral, the title, the date. */}
        <View style={styles.opening}>
          {!!lesson.lesson_number && (
            <Text style={styles.numeral}>{gematria(lesson.lesson_number)}</Text>
          )}
          <Text style={styles.title}>{lesson.title}</Text>
          <Text variant="bodySmall" style={styles.meta}>
            {[label, lesson.lesson_date ? formatHebrewDate(lesson.lesson_date) : null]
              .filter(Boolean).join(', ')}
          </Text>
          {(lesson.is_free || locked) && (
            <Text variant="labelMedium" style={locked ? styles.locked : styles.free}>
              {locked ? 'נעול' : 'פתוח לכולן'}
            </Text>
          )}
          {!!lesson.description && (
            <Text variant="bodyLarge" style={styles.description}>{lesson.description}</Text>
          )}
          <View style={styles.rule} />
        </View>

        {track
          ? <LessonPlayer trackId={track.id} title={lesson.title} />
          : <Text style={styles.empty}>עדיין אין הקלטה זמינה.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  barTitle: { fontFamily: fonts.sansMedium, fontSize: 16, color: colors.textSecondary },
  wrap: { padding: 20, gap: 16, paddingBottom: 48 },
  opening: { alignItems: 'center', gap: 6, paddingTop: 12 },
  numeral: { fontFamily: fonts.serifBold, fontSize: 44, lineHeight: 52, color: colors.primary },
  title: {
    fontFamily: fonts.serif, fontSize: 28, lineHeight: 36, color: colors.text, textAlign: 'center',
  },
  meta: { color: colors.textSecondary, textAlign: 'center' },
  free: { color: colors.primary },
  locked: { color: colors.locked },
  description: { color: colors.textSecondary, textAlign: 'center', marginTop: 8, maxWidth: 480 },
  rule: { width: 48, height: 1, backgroundColor: colors.primary, opacity: 0.5, marginTop: 18 },
  loader: { marginTop: 64 },
  empty: { textAlign: 'center', marginTop: 48, color: colors.textSecondary },
});
