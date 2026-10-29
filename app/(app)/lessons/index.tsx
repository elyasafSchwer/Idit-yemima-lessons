import { useCallback, useState } from 'react';
import { FlatList, Linking, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Text, Card, Chip, Button, Surface, Banner, ActivityIndicator, Appbar,
} from 'react-native-paper';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import { colors, WHATSAPP_URL } from '@/lib/theme';

type Lesson = {
  id: string;
  lesson_number: number | null;
  title: string;
  description: string | null;
  lesson_date: string | null;
  is_free: boolean;
  status: string;
};

export default function Lessons() {
  const { username, isAdmin, hasAccess, accessExpiresAt, signOut, refreshAccess } = useAuth();
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('lessons')
      .select('id, lesson_number, title, description, lesson_date, is_free, status')
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

  const expiry = accessExpiresAt
    ? new Date(accessExpiresAt).toLocaleDateString('he-IL')
    : null;

  return (
    <View style={styles.flex}>
      <Appbar.Header elevated>
        <Appbar.Content title="השיעורים" subtitle={username ?? undefined} />
        {isAdmin && (
          <Appbar.Action icon="cog" onPress={() => router.push('/(app)/admin')} />
        )}
        <Appbar.Action icon="logout" onPress={signOut} />
      </Appbar.Header>

      {!hasAccess && (
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

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" />
      ) : (
        <FlatList
          data={lessons}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <Text variant="bodyLarge" style={styles.empty}>
              {isAdmin ? 'עדיין לא העלית שיעורים.' : 'עדיין אין שיעורים זמינים.'}
            </Text>
          }
          renderItem={({ item }) => {
            const locked = !item.is_free && !hasAccess;
            return (
              <Card
                style={styles.card}
                onPress={() => router.push(`/(app)/lessons/${item.id}`)}
              >
                <Card.Title
                  title={item.lesson_number ? `${item.lesson_number}. ${item.title}` : item.title}
                  subtitle={item.lesson_date
                    ? new Date(item.lesson_date).toLocaleDateString('he-IL')
                    : undefined}
                  right={() => (
                    <View style={styles.chips}>
                      {item.is_free && <Chip compact>פתוח</Chip>}
                      {locked && <Chip compact icon="lock">נעול</Chip>}
                    </View>
                  )}
                />
                {item.description && (
                  <Card.Content>
                    <Text variant="bodyMedium" numberOfLines={2}>{item.description}</Text>
                  </Card.Content>
                )}
              </Card>
            );
          }}
        />
      )}

      {isAdmin && (
        <Button
          mode="contained"
          icon="plus"
          style={styles.fab}
          onPress={() => router.push('/(app)/admin/lessons/new')}
        >
          שיעור חדש
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 16 },
  chips: { flexDirection: 'row', gap: 6, marginEnd: 12 },
  accessBar: { paddingVertical: 6, paddingHorizontal: 16, backgroundColor: colors.primaryDark },
  accessText: { color: '#fff', textAlign: 'center' },
  loader: { marginTop: 48 },
  empty: { textAlign: 'center', marginTop: 48, color: colors.textSecondary },
  fab: { position: 'absolute', bottom: 24, start: 24, end: 24, borderRadius: 12 },
});
