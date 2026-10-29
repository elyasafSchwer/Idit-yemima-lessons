import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';
import {
  Appbar, Searchbar, Card, Text, Button, Chip, Portal, Dialog, Menu,
  ActivityIndicator, Snackbar, IconButton,
} from 'react-native-paper';
import { supabase } from '@/lib/supabase';
import { formatHebrewDate } from '@/lib/hebrewDate';
import { goBack } from '@/lib/navigation';
import BackAction from '@/components/BackAction';
import HeaderTitle from '@/components/HeaderTitle';
import { useAuth } from '@/context/auth';
import { colors } from '@/lib/theme';

type Row = {
  id: string;
  username: string;
  role: 'admin' | 'student';
  expiresAt: string | null;   // latest active entitlement
};

const DAY = 86400_000;

export default function AdminUsers() {
  const { isAdmin, session } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleteFor, setDeleteFor] = useState<Row | null>(null);
  const [roleFor, setRoleFor] = useState<{ row: Row; role: Row['role'] } | null>(null);

  const load = useCallback(async () => {
    // profiles and entitlements both point at auth.users, not at each other, so
    // PostgREST cannot embed them -- fetch both and join here.
    const [{ data: profiles }, { data: ents }] = await Promise.all([
      supabase.from('profiles').select('id, username, role').order('username'),
      supabase.from('entitlements')
        .select('user_id, expires_at')
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: false }),
    ]);
    const latest = new Map<string, string>();
    for (const e of ents ?? []) {
      if (!latest.has(e.user_id)) latest.set(e.user_id, e.expires_at);
    }
    setRows((profiles ?? []).map((p) => ({ ...p, expiresAt: latest.get(p.id) ?? null } as Row)));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Idit grants access and then wants to see it, without leaving the screen.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(
    () => rows.filter((r) => r.username.includes(query.trim())),
    [rows, query],
  );

  const grant = async (row: Row, fromExisting: boolean) => {
    setBusyId(row.id);
    // Extending starts from the current expiry so a renewal does not lose the
    // remaining days; a fresh grant starts today.
    const start = fromExisting && row.expiresAt ? new Date(row.expiresAt) : new Date();
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    const { error } = await supabase.from('entitlements').insert({
      user_id: row.id,
      starts_at: start.toISOString(),
      expires_at: end.toISOString(),
      granted_by: session?.user?.id ?? null,
      method: 'manual',
    });
    setBusyId(null);
    setToast(error ? 'הפעולה נכשלה' : `${row.username} — גישה עד ${formatHebrewDate(end)}`);
    if (!error) load();
  };

  const revoke = async (row: Row) => {
    setBusyId(row.id);
    const { error } = await supabase
      .from('entitlements')
      .update({ expires_at: new Date().toISOString() })
      .eq('user_id', row.id)
      .gt('expires_at', new Date().toISOString());
    setBusyId(null);
    setToast(error ? 'הפעולה נכשלה' : `הגישה של ${row.username} בוטלה`);
    if (!error) load();
  };

  // Role changes go through an RPC that checks the caller is an admin and
  // refuses to demote the caller, so the app can never end up with no admin.
  const changeRole = async () => {
    if (!roleFor) return;
    const { row, role } = roleFor;
    setRoleFor(null);
    setBusyId(row.id);
    const { error } = await supabase.rpc('set_user_role', { target: row.id, new_role: role });
    setBusyId(null);
    setToast(error ? 'הפעולה נכשלה'
      : role === 'admin' ? `${row.username} היא עכשיו מנהלת` : `${row.username} כבר לא מנהלת`);
    if (!error) load();
  };

  // There is no password-reset email (logins are usernames), so a student who
  // forgot her password is deleted and signs up again.
  const submitDelete = async () => {
    if (!deleteFor) return;
    const row = deleteFor;
    setDeleteFor(null);
    setBusyId(row.id);
    const { error } = await supabase.functions.invoke('admin-delete-user', { body: { userId: row.id } });
    setBusyId(null);
    setToast(error ? 'המחיקה נכשלה' : `${row.username} נמחקה`);
    if (!error) load();
  };

  if (!isAdmin) return <Redirect href="/(app)/lessons" />;

  return (
    <View style={styles.flex}>
      <Appbar.Header elevated>
        <BackAction onPress={() => goBack(router, '/(app)/admin')} />
        <Appbar.Content title={<HeaderTitle title="הרשאות תלמידות" subtitle={`${rows.length} משתמשות`} />} />
      </Appbar.Header>

      <Searchbar
        placeholder="חיפוש לפי שם משתמש"
        value={query}
        onChangeText={setQuery}
        style={styles.search}
      />

      {loading ? <ActivityIndicator style={styles.loader} size="large" /> : (
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>לא נמצאו משתמשות.</Text>}
          renderItem={({ item }) => {
            const expires = item.expiresAt ? new Date(item.expiresAt) : null;
            const soon = expires ? expires.getTime() - Date.now() < 30 * DAY : false;
            const busy = busyId === item.id;
            return (
              <Card style={styles.card}>
                <Card.Title
                  title={item.username}
                  subtitle={
                    item.role === 'admin' ? 'מנהלת'
                      : expires ? `גישה עד ${formatHebrewDate(expires)}`
                      : 'אין גישה'
                  }
                  right={() => (
                    <View style={styles.chip}>
                      {item.role === 'admin' ? <Chip compact icon="shield-account">מנהלת</Chip>
                        : expires
                          ? <Chip compact icon={soon ? 'clock-alert' : 'check'}
                                  selectedColor={soon ? colors.error : undefined}>
                              {soon ? 'פגה בקרוב' : 'פעילה'}
                            </Chip>
                          : <Chip compact icon="lock">נעולה</Chip>}
                    </View>
                  )}
                />
                {item.role !== 'admin' && (
                  // One primary action plus an overflow menu. Three buttons in a
                  // row overflowed the card and clipped the middle label, and a
                  // destructive action should not sit bare next to a routine one.
                  <Card.Actions>
                    <Menu
                      visible={menuFor === item.id}
                      onDismiss={() => setMenuFor(null)}
                      anchor={
                        <IconButton
                          icon="dots-vertical"
                          disabled={busy}
                          onPress={() => setMenuFor(item.id)}
                        />
                      }
                    >
                      <Menu.Item
                        leadingIcon="shield-account"
                        title="הפיכה למנהלת"
                        onPress={() => { setMenuFor(null); setRoleFor({ row: item, role: 'admin' }); }}
                      />
                      <Menu.Item
                        leadingIcon="account-remove"
                        title="מחיקת המשתמשת"
                        titleStyle={{ color: colors.error }}
                        onPress={() => { setMenuFor(null); setDeleteFor(item); }}
                      />
                      {expires && (
                        <Menu.Item
                          leadingIcon="lock"
                          title="ביטול הגישה"
                          titleStyle={{ color: colors.error }}
                          onPress={() => { setMenuFor(null); revoke(item); }}
                        />
                      )}
                    </Menu>
                    <Button
                      mode="contained" compact loading={busy} disabled={busy}
                      onPress={() => grant(item, !!expires)}
                    >
                      {expires ? 'הארכה בשנה' : 'פתיחת גישה לשנה'}
                    </Button>
                  </Card.Actions>
                )}
                {item.role === 'admin' && item.id !== session?.user?.id && (
                  <Card.Actions>
                    <Button
                      mode="text" compact loading={busy} disabled={busy}
                      onPress={() => setRoleFor({ row: item, role: 'student' })}
                    >
                      ביטול הרשאות ניהול
                    </Button>
                  </Card.Actions>
                )}
              </Card>
            );
          }}
        />
      )}

      <Portal>
        <Dialog visible={!!deleteFor} onDismiss={() => setDeleteFor(null)}>
          <Dialog.Title>מחיקת {deleteFor?.username}</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              החשבון, ההרשאה ונקודות העצירה שלה יימחקו. אם שכחה סיסמה, היא יכולה להירשם מחדש,
              ואז צריך לפתוח לה שוב את הגישה.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteFor(null)}>ביטול</Button>
            <Button mode="contained" buttonColor={colors.error} onPress={submitDelete}>מחיקה</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog visible={!!roleFor} onDismiss={() => setRoleFor(null)}>
          <Dialog.Title>
            {roleFor?.role === 'admin' ? 'הפיכה למנהלת' : 'ביטול הרשאות ניהול'} — {roleFor?.row.username}
          </Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {roleFor?.role === 'admin'
                ? 'מנהלת יכולה להעלות שיעורים, לפתוח ולבטל גישה, לאפס סיסמאות ולמנות מנהלות נוספות.'
                : 'היא תחזור להיות תלמידה רגילה.'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRoleFor(null)}>ביטול</Button>
            <Button mode="contained" onPress={changeRole}>אישור</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>
        {toast ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  search: { margin: 16, marginBottom: 8 },
  list: { padding: 16, paddingTop: 8, gap: 10 },
  card: { backgroundColor: colors.surface, borderRadius: 16 },
  chip: { marginEnd: 12, alignSelf: 'center' },
  loader: { marginTop: 64 },
  empty: { textAlign: 'center', marginTop: 48, color: colors.textSecondary },
});
