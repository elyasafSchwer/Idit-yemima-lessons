import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, Redirect, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import {
  Appbar, TextInput, Button, Card, Text, IconButton, Switch,
  HelperText, ProgressBar, Divider,
} from 'react-native-paper';
import { supabase } from '@/lib/supabase';
import HeaderTitle from '@/components/HeaderTitle';
import { useAuth } from '@/context/auth';
import { dispatchIngest, type TrackKind } from '@/lib/ingest';
import { colors } from '@/lib/theme';

type Part = { uri: string; name: string; size: number | null };

export default function NewLesson() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  // With a lessonId this screen adds a recording (usually the summary) to an
  // existing lesson, or replaces one, instead of creating a lesson.
  const params = useLocalSearchParams<{ lessonId?: string; kind?: TrackKind }>();
  const existingId = params.lessonId ?? null;
  const [existingTitle, setExistingTitle] = useState<string | null>(null);

  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [isFree, setIsFree] = useState(false);
  // A new lesson starts with its full recording; the summary is added later
  // from the manage screen, once the lesson exists.
  const kind: TrackKind = params.kind === 'summary' ? 'summary' : 'full';
  const [parts, setParts] = useState<Part[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!existingId) return;
    supabase.from('lessons').select('title').eq('id', existingId).single()
      .then(({ data }) => setExistingTitle(data?.title ?? ''));
  }, [existingId]);

  if (!isAdmin) return <Redirect href="/(app)/lessons" />;

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (res.canceled) return;
    setParts((prev) => [
      ...prev,
      ...res.assets.map((a) => ({ uri: a.uri, name: a.name, size: a.size ?? null })),
    ]);
  };

  // WhatsApp filenames carry no reliable ordering -- all the parts of one
  // recording share a timestamp -- so Idit sets the order by hand.
  const move = (i: number, delta: number) => {
    setParts((prev) => {
      const next = [...prev];
      const j = i + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const submit = async () => {
    if (!existingId && !title.trim()) { setError('צריך כותרת לשיעור'); return; }
    if (parts.length === 0) { setError('צריך לבחור לפחות הקלטה אחת'); return; }
    if (!existingId && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('תאריך בפורמט YYYY-MM-DD'); return; }

    setError(null);
    setProgress(0);
    try {
      let lesson: { id: string };
      if (existingId) {
        lesson = { id: existingId };
        // The pipeline merges every object under the prefix, so parts left
        // from an earlier upload would be stitched into this one.
        const prefix = `${existingId}/${kind}`;
        const { data: old } = await supabase.storage.from('incoming').list(prefix);
        if (old && old.length > 0) {
          const { error: rmErr } = await supabase.storage
            .from('incoming').remove(old.map((o) => `${prefix}/${o.name}`));
          if (rmErr) throw rmErr;
        }
      } else {
        const { data, error: lessonErr } = await supabase
          .from('lessons')
          .insert({
            lesson_number: number ? Number(number) : null,
            title: title.trim(),
            description: description.trim() || null,
            lesson_date: date,
            is_free: isFree,
            status: 'processing',
          })
          .select('id')
          .single();
        if (lessonErr || !data) throw lessonErr ?? new Error('lesson insert failed');
        lesson = data;
      }

      // Raw parts land in `incoming`; the pipeline merges, transcodes and
      // encrypts them into `lessons`. Uploading in order keeps the index
      // meaningful even if a name is odd.
      const uploaded: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        // WhatsApp names contain spaces, which break the pipeline's URLs.
        // The index alone carries the order; keep only the extension.
        const ext = p.name.includes('.') ? p.name.split('.').pop()!.toLowerCase() : 'ogg';
        const path = `${lesson.id}/${kind}/${String(i).padStart(2, '0')}.${ext}`;
        const body = await (await fetch(p.uri)).blob();
        const { error: upErr } = await supabase.storage
          .from('incoming')
          .upload(path, body, { upsert: true });
        if (upErr) throw upErr;
        uploaded.push(path);
        setProgress((i + 1) / parts.length);
      }

      const { error: jobErr } = await supabase.from('ingest_jobs').insert({
        lesson_id: lesson.id,
        kind,
        parts: uploaded,
        status: 'processing',
      });
      if (jobErr) throw jobErr;

      // Hand off to the GitHub Actions pipeline. A failure here is reported on
      // the job row, so the lesson does not sit on "processing" silently.
      const { error: dispatchErr } = await dispatchIngest(lesson.id, kind);
      if (dispatchErr) {
        setProgress(null);
        setError('ההקלטות הועלו, אבל העיבוד לא הופעל. אפשר ללחוץ "נסי שוב" במסך ניהול השיעורים.');
        return;
      }

      // Coming from the manage screen, go back to it rather than stacking a
      // second copy on top.
      if (existingId) router.back();
      else router.replace('/(app)/admin/lessons');
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : 'ההעלאה נכשלה');
    }
  };

  const totalMb = parts.reduce((s, p) => s + (p.size ?? 0), 0) / 1048576;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Appbar.Header elevated>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title={(
            <HeaderTitle
              title={existingId ? (kind === 'summary' ? 'העלאת סיכום' : 'העלאת הקלטה') : 'שיעור חדש'}
              subtitle={existingTitle}
            />
          )}
        />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        {!existingId && (
          <>
            <View style={styles.row}>
              <TextInput
                mode="outlined" label="מס׳" value={number} onChangeText={setNumber}
                keyboardType="number-pad" style={styles.numberInput}
              />
              <TextInput
                mode="outlined" label="כותרת" value={title} onChangeText={setTitle}
                style={styles.flexInput}
              />
            </View>

            <TextInput
              mode="outlined" label="תיאור קצר" value={description} onChangeText={setDescription}
              multiline numberOfLines={3}
            />
            <TextInput
              mode="outlined" label="תאריך השיעור" value={date} onChangeText={setDate}
              placeholder="2026-10-19" autoCapitalize="none"
            />

            <View style={styles.switchRow}>
              <Text variant="bodyLarge">פתוח לכולן בחינם</Text>
              <Switch value={isFree} onValueChange={setIsFree} />
            </View>
            <Divider />
          </>
        )}

        <View style={styles.switchRow}>
          <Text variant="titleSmall">
            הקלטות {parts.length > 0 && `— ${parts.length}, ${totalMb.toFixed(1)}MB`}
          </Text>
          <Button mode="outlined" icon="plus" compact onPress={pick}>הוספה</Button>
        </View>
        <HelperText type="info" visible>
          הסדר כאן הוא הסדר שבו ההקלטות יחוברו. שמות הקבצים של וואטסאפ לא מעידים על הסדר.
        </HelperText>

        {parts.map((p, i) => (
          <Card key={`${p.uri}-${i}`} style={styles.partCard}>
            <Card.Title
              title={`${i + 1}. ${p.name}`}
              titleNumberOfLines={2}
              subtitle={p.size ? `${(p.size / 1048576).toFixed(1)}MB` : undefined}
              right={() => (
                <View style={styles.partActions}>
                  <IconButton icon="arrow-up" size={18} disabled={i === 0} onPress={() => move(i, -1)} />
                  <IconButton icon="arrow-down" size={18} disabled={i === parts.length - 1} onPress={() => move(i, 1)} />
                  <IconButton icon="close" size={18}
                    onPress={() => setParts((prev) => prev.filter((_, k) => k !== i))} />
                </View>
              )}
            />
          </Card>
        ))}

        {error && <HelperText type="error" visible>{error}</HelperText>}
        {progress !== null && (
          <>
            <ProgressBar progress={progress} />
            <Text variant="bodySmall" style={styles.progressText}>
              מעלה… {Math.round(progress * 100)}%
            </Text>
          </>
        )}

        <Button
          mode="contained"
          onPress={submit}
          disabled={progress !== null}
          loading={progress !== null}
          style={styles.submit}
        >
          העלאה
        </Button>
        <HelperText type="info" visible>
          אחרי ההעלאה השיעור יעבור עיבוד (מיזוג, המרה והצפנה) ויופיע כזמין כשיסתיים.
        </HelperText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  wrap: { padding: 16, gap: 12, paddingBottom: 48 },
  row: { flexDirection: 'row', gap: 10 },
  numberInput: { width: 84 },
  flexInput: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  partCard: { backgroundColor: colors.surface, borderRadius: 12 },
  partActions: { flexDirection: 'row', alignItems: 'center' },
  progressText: { textAlign: 'center', color: colors.textSecondary },
  submit: { marginTop: 8, borderRadius: 12, paddingVertical: 4 },
});
