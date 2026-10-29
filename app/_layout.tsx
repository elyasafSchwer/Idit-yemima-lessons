import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { I18nManager, Platform, StyleSheet, View } from 'react-native';
import { Stack, SplashScreen } from 'expo-router';
import * as Updates from 'expo-updates';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider, ActivityIndicator } from 'react-native-paper';
import { setAudioModeAsync } from 'expo-audio';
import { AuthProvider, useAuth } from '@/context/auth';
import { theme, colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

// forceRTL only takes effect on the NEXT native launch, so on a fresh install
// the first run would come up LTR. Flip the flag and reload once.
// Everything below relies on React Native's own RTL flipping -- do NOT add
// per-screen row-reverse or textAlign:'right' overrides. That double-flips and
// is exactly the bug that had to be unpicked across every screen in yeshkore.
// On web, `app/+html.tsx` is ignored because this build uses output: "single"
// (an SPA, chosen so server rendering never has to run browser-only code), so
// lang/dir are set here instead. The app shows a loading state first, so the
// one frame before this runs is not visible.
if (Platform.OS === 'web') {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = 'he';
    document.documentElement.dir = 'rtl';
  }
} else if (!I18nManager.isRTL) {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
  Updates.reloadAsync().catch(() => {});
}

// A 50-minute lesson is listened to while driving or with the screen locked.
setAudioModeAsync({
  shouldPlayInBackground: true,
  playsInSilentMode: true,
  interruptionMode: 'doNotMix',
  allowsRecording: false,
  shouldRouteThroughEarpiece: false,
}).catch(() => {});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={theme}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, isLoading, isProfileLoading } = useAuth();
  const ready = !isLoading && !isProfileLoading;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Belt and braces: never let the splash outlive a stuck request. Without an
  // asset it is a blank white screen with nothing to debug.
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 8000);
    return () => clearTimeout(t);
  }, []);

  if (!ready) {
    return <ActivityIndicator style={{ flex: 1 }} size="large" />;
  }

  return (
    // On a wide browser window every screen would stretch edge to edge, so the
    // web build keeps one phone-like column in the middle. Native is unaffected.
    <View style={styles.page}>
      <View style={styles.column}>
        {/* BOTH groups must be guarded. Guarding only (auth) leaves (app) mounted
            for everyone, so a signed-out visitor lands on the catalogue and sits
            on a spinner while RLS refuses the query. */}
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
      </View>
    </View>
  );
}

const WEB_COLUMN = 600;

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Platform.OS === 'web' ? '#EADCCD' : colors.background },
  column: Platform.OS === 'web'
    ? {
      flex: 1, width: '100%', maxWidth: WEB_COLUMN, alignSelf: 'center',
      backgroundColor: colors.background, overflow: 'hidden',
    }
    : { flex: 1 },
});
