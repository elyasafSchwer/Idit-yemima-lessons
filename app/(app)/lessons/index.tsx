import { useCallback, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Text, Button, Surface, Banner, ActivityIndicator, Appbar, FAB, Icon,
} from 'react-native-paper';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import Tabs from '@/components/Tabs';
import { formatHebrewDate } from '@/lib/hebrewDate';
import HeaderTitle from '@/components/HeaderTitle';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '@/lib/categories';
import { isUnlimited, SHOW_LOCKED } from '@/lib/access';
import { APP_NAME, colors, fonts, WHATSAPP_URL, appbarStyle } from '@/lib/theme';

type Lesson = {
  id: string;
  lesson_number: number | null;
  title: string;
  description: string | null;
  lesson_date: string | null;
  is_free: boolean;
  status: string;
  category: Category;
};

export default function Lessons() {
  const { username, isAdmin, hasAccess, accessExpiresAt, signOut, refreshAccess } = useAuth();
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<Category>('lesson');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('lessons')
      .select('id, lesson_number, title, description, lesson_date, is_free, status, category')
      .eq('status', 'ready')
      .order('lesson_date', { ascending: false });
    setLessons((data as Lesson[]) ?? []);
    setLoading(false);
  }, []);

  // Idit may have granted access since the screen was last seen.
  useFocusEffect(useCallback(() => { load(); refreshAccess(); }, [load, refreshAccess]));

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refreshAccess()]);
    setRefreshing(false);
  };

  // The end date Idit chose. Shown as a fact, never as a period ("a year").
  const expiry = accessExpiresAt && !isUnlimited(accessExpiresAt)
    ? formatHebrewDate(accessExpiresAt) : null;

  return (
    <View style={styles.flex}>
      <Appbar.Header style={appbarStyle}>
        <Appbar.Content title={<HeaderTitle title={APP_NAME} subtitle={username} />} />
        {isAdmin && (
          <Button
            mode="outlined" icon="tune-variant" compact style={styles.adminButton}
            onPress={() => router.push('/(app)/admin')}
          >
            ניהול
          </Button>
        )}
        <Appbar.Action icon="logout" onPress={signOut} />
      </Appbar.Header>

      {!hasAccess && SHOW_LOCKED && (
        <Banner
          visible
          icon="lock-outline"
          actions={[{ label: 'פנייה לעידית', onPress: () => Linking.openURL(WHATSAPP_URL) }]}
        >
          השיעור הפתוח זמין לכולן. לגישה לשאר השיעורים ולסיכומים — אפשר לפנות לעידית בוואטסאפ.
        </Banner>
      )}

      {hasAccess && expiry && !isAdmin && (
        <Surface style={styles.accessBar} elevation={0}>
          <Text variant="bodySmall" style={styles.accessText}>
            הגישה שלך בתוקף עד {expiry}
          </Text>
        </Surface>
      )}

      <Tabs
        style={styles.tabs}
        value={category}
        onValueChange={(v) => setCategory(v as Category)}
        buttons={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
      />

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" />
      ) : (
        <FlatList
          data={lessons.filter((l) => l.category === category
            && (SHOW_LOCKED || hasAccess || l.is_free))}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <Text variant="bodyLarge" style={styles.empty}>
              {category === 'summary' ? 'עדיין אין סיכומים.' : 'עדיין אין שיעורים.'}
            </Text>
          }
          renderItem={({ item }) => (
            <LessonRow
              lesson={item}
              locked={!item.is_free && !hasAccess}
              onPress={() => router.push(`/(app)/lessons/${item.id}`)}
            />
          )}
        />
      )}

      {isAdmin && (
        <FAB
          icon="plus"
          label={category === 'summary' ? 'סיכום חדש' : 'שיעור חדש'}
          color="#fff"
          style={styles.fab}
          onPress={() => router.push({ pathname: '/(app)/admin/lessons/new', params: { category } })}
        />
      )}
    </View>
  );
}

// One lesson in the list. The number leads the row, large and in burgundy:
// it is the one decorative element, so everything else in the row stays plain.
function LessonRow({ lesson, locked, onPress }: { lesson: Lesson; locked: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
    >
      <View style={styles.numeral}>
        {lesson.lesson_number
          ? <Text style={styles.numeralText}>{lesson.lesson_number}</Text>
          : null}
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>{lesson.title}</Text>
        {!!lesson.description && (
          <Text variant="bodyMedium" style={styles.rowDescription} numberOfLines={2}>{lesson.description}</Text>
        )}
        <View style={styles.rowMeta}>
          {!!lesson.lesson_date && (
            <Text variant="bodySmall" style={styles.rowDate}>{formatHebrewDate(lesson.lesson_date)}</Text>
          )}
          {lesson.is_free && <Text variant="labelSmall" style={styles.free}>פתוח לכולן</Text>}
        </View>
      </View>
      <View style={styles.rowEnd}>
        {locked
          ? <Icon source="lock-outline" size={18} color={colors.locked} />
          : <Icon source="play-circle-outline" size={26} color={colors.primary} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  accessBar: {
    paddingVertical: 8, paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outline,
  },
  accessText: { color: colors.primaryDark, textAlign: 'center' },
  tabs: { marginHorizontal: 20, marginTop: 8 },
  list: { paddingHorizontal: 16, paddingTop: 16, gap: 10, paddingBottom: 112 },
  adminButton: { marginEnd: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.surface, borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.outline,
    paddingVertical: 16, paddingHorizontal: 16,
    // One height for every row, with or without a description, so lessons and
    // summaries line up the same when switching tabs.
    minHeight: 112,
  },
  rowPressed: { backgroundColor: colors.primarySoft },
  numeral: {
    width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center',
    borderEndWidth: StyleSheet.hairlineWidth, borderEndColor: colors.outline, paddingEnd: 12,
  },
  numeralText: { fontFamily: fonts.headingBold, fontSize: 26, lineHeight: 32, color: colors.primary },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 26, color: colors.text },
  rowDescription: { color: colors.textSecondary },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  rowDate: { color: colors.textSecondary },
  free: { color: colors.primary },
  rowEnd: { width: 28, alignItems: 'center' },
  loader: { marginTop: 48 },
  empty: { textAlign: 'center', marginTop: 48, color: colors.textSecondary },
  fab: { position: 'absolute', bottom: 24, end: 20, backgroundColor: colors.primary, borderRadius: 28 },
});
