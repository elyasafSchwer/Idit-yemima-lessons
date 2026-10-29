import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import { Text, TextInput, Button, Surface, HelperText } from 'react-native-paper';
import { useAuth } from '@/context/auth';
import { isValidUsername, MIN_PASSWORD_LENGTH } from '@/lib/username';
import { colors } from '@/lib/theme';

export default function SignUp() {
  const { signUp } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const name = username.trim();
    if (!isValidUsername(name)) {
      setError('שם המשתמש יכול להכיל אותיות בעברית או באנגלית, ספרות וקו תחתון, לפחות 2 תווים');
      return;
    }
    // Must match auth.minimum_password_length in supabase/config.toml.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`הסיסמה חייבת להכיל לפחות ${MIN_PASSWORD_LENGTH} תווים`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signUp(name, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההרשמה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text variant="displaySmall" style={styles.title}>הרשמה</Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          ההרשמה חינם. אחריה אפשר לשמוע את השיעור הפתוח, ולבקש גישה לשאר.
        </Text>

        <Surface style={styles.card} elevation={2}>
          <TextInput
            mode="outlined"
            label="שם משתמש"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            label="סיסמה"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword((v) => !v)}
              />
            }
            style={styles.input}
          />
          <HelperText type="info" visible>
            שימי לב: אין שחזור סיסמה אוטומטי. אם תשכחי, צריך לפנות לעידית.
          </HelperText>

          {error && <HelperText type="error" visible>{error}</HelperText>}

          <Button
            mode="contained"
            onPress={submit}
            loading={busy}
            disabled={busy}
            style={styles.button}
          >
            הרשמה
          </Button>
        </Surface>

        <View style={styles.footer}>
          <Text variant="bodyMedium">כבר יש לך חשבון?</Text>
          <Link href="/(auth)/sign-in" asChild>
            <Button mode="text" compact>כניסה</Button>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  title: { textAlign: 'center', color: colors.primary, fontWeight: '700' },
  subtitle: { textAlign: 'center', color: colors.textSecondary, marginTop: 6, marginBottom: 28 },
  card: { borderRadius: 16, padding: 20, backgroundColor: colors.surface },
  input: { marginBottom: 12, backgroundColor: colors.surface },
  button: { marginTop: 8, borderRadius: 12, paddingVertical: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
});
