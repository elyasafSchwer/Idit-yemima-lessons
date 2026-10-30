import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';
import { Appbar, Card, Text, Badge, ActivityIndicator, Avatar } from 'react-native-paper';
import { supabase } from '@/lib/supabase';
import { goBack } from '@/lib/navigation';
import BackAction from '@/components/BackAction';
import { useAuth } from '@/context/auth';
import { colors, appbarStyle } from '@/lib/theme';

export default function AdminHome() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({ lessons: 0, students: 0, active: 0, expiring: 0, failed: 0, processing: 0 });
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      const soon = new Date(Date.now() + 30 * 86400_000).toISOString();
      const now = new Date().toISOString();
      const [lessons, students, active, expiring, failed, processing] = await Promise.all([
        supabase.from('lessons').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        supabase.from('entitlements').select('id', { count: 'exact', head: true }).gt('expires_at', now),
        supabase.from('entitlements').select('id', { count: 'exact', head: true })
          .gt('expires_at', now).lt('expires_at', soon),
        supabase.from('ingest_jobs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
        supabase.from('ingest_jobs').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
      ]);
      if (cancelled) return;
      setStats({
        lessons: lessons.count ?? 0,
        students: students.count ?? 0,
        active: active.count ?? 0,
        expiring: expiring.count ?? 0,
        failed: failed.count ?? 0,
        processing: processing.count ?? 0,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []));

  // Defence in depth: RLS already blocks the writes, this just avoids showing
  // a screen full of empty counters to a student who guessed the URL.
  if (!isAdmin) return <Redirect href="/(app)/lessons" />;

  return (
    <View style={styles.flex}>
      <Appbar.Header style={appbarStyle}>
        <BackAction onPress={() => goBack(router, '/(app)/lessons')} />
        <Appbar.Content title="ניהול" />
      </Appbar.Header>

      {loading ? <ActivityIndicator style={styles.loader} size="large" /> : (
        <ScrollView contentContainerStyle={styles.wrap}>
          <View style={styles.row}>
            <Stat label="שיעורים" value={stats.lessons} />
            <Stat label="תלמידות" value={stats.students} />
            <Stat label="הרשאות פעילות" value={stats.active} />
          </View>

          {stats.failed > 0 && (
            <Card mode="outlined" style={[styles.card, styles.failedCard]} onPress={() => router.push('/(app)/admin/lessons')}>
              <Card.Title
                title={`${stats.failed} העלאות נכשלו`}
                subtitle="לחצי כדי לנסות שוב"
                titleStyle={{ color: colors.error }}
                left={(p) => <Avatar.Icon {...p} icon="alert" color="#fff" style={{ backgroundColor: colors.error }} />}
              />
            </Card>
          )}

          <Card mode="outlined" style={styles.card} onPress={() => router.push('/(app)/admin/lessons/new')}>
            <Card.Title
              title="העלאת שיעור חדש" subtitle="הקלטות וואטסאפ, לפי סדר"
              left={(p) => <Avatar.Icon {...p} icon="plus" />}
            />
          </Card>

          <Card mode="outlined" style={styles.card} onPress={() => router.push('/(app)/admin/lessons')}>
            <Card.Title
              title="ניהול שיעורים"
              subtitle={stats.processing > 0
                ? `${stats.processing} בעיבוד עכשיו`
                : 'העלאת סיכום, החלפת הקלטה, ניסיון חוזר'}
              left={(p) => <Avatar.Icon {...p} icon="playlist-music" />}
            />
          </Card>

          <Card mode="outlined" style={styles.card} onPress={() => router.push('/(app)/admin/stats')}>
            <Card.Title
              title="סטטיסטיקות האזנה"
              subtitle="מי האזינה, לכמה מהשיעור, ומתי"
              left={(p) => <Avatar.Icon {...p} icon="chart-bar" />}
            />
          </Card>

          <Card mode="outlined" style={styles.card} onPress={() => router.push('/(app)/admin/users')}>
            <Card.Title
              left={(p) => <Avatar.Icon {...p} icon="account-key" />}
              title="הרשאות תלמידות"
              subtitle={stats.expiring > 0
                ? `${stats.expiring} הרשאות פגות בחודש הקרוב`
                : 'פתיחה, הארכה וביטול'}
              right={() => stats.expiring > 0
                ? <Badge style={styles.badge}>{stats.expiring}</Badge>
                : null}
            />
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card mode="outlined" style={styles.stat}>
      <Card.Content>
        <Text variant="headlineMedium" style={styles.statValue}>{value}</Text>
        <Text variant="bodySmall" style={styles.statLabel}>{label}</Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: 14 },
  statValue: { color: colors.primary, textAlign: 'center' },
  statLabel: { color: colors.textSecondary, textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: 16 },
  failedCard: { borderWidth: 1, borderColor: colors.error },
  badge: { marginEnd: 16, alignSelf: 'center' },
  loader: { marginTop: 64 },
});
