import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, Image } from 'react-native';
import { Link } from 'expo-router';
import { Text, TextInput, Button, Surface, HelperText } from 'react-native-paper';
import { useAuth } from '@/context/auth';
import Field from '@/components/Field';
import { colors } from '@/lib/theme';

export default function SignIn() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('יש למלא שם משתמש וסיסמה');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההתחברות נכשלה');
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
        <Image source={require('../../assets/icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
        <Text variant="displaySmall" style={styles.title}>שיעורי עידית</Text>
        <Text variant="bodyLarge" style={styles.subtitle}>
          שיעורים בתורות הרבנית ימימה מזרחי
        </Text>

        <Surface style={styles.card} elevation={0}>
          <Field
            mode="outlined"
            label="שם משתמש"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Field
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

          {error && <HelperText type="error" visible>{error}</HelperText>}

          <Button
            mode="contained"
            onPress={submit}
            loading={busy}
            disabled={busy}
            style={styles.button}
          >
            כניסה
          </Button>
        </Surface>

        <View style={styles.footer}>
          <Text variant="bodyMedium">עדיין אין לך חשבון?</Text>
          <Link href="/(auth)/sign-up" asChild>
            <Button mode="text" compact>הרשמה</Button>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { width: 72, height: 72, borderRadius: 18, alignSelf: 'center', marginBottom: 16 },
  title: { textAlign: 'center', color: colors.primaryDark },
  subtitle: { textAlign: 'center', color: colors.textSecondary, marginTop: 6, marginBottom: 28 },
  card: {
    borderRadius: 14, padding: 20, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.outline,
  },
  input: { marginBottom: 12, backgroundColor: colors.surface },
  button: { marginTop: 8, borderRadius: 10, paddingVertical: 4 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
});
