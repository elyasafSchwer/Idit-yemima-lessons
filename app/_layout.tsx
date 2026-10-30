import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { I18nManager, ImageBackground, Platform, StyleSheet, View } from 'react-native';
import {
  Stack, SplashScreen, useRouter, useRootNavigationState, ThemeProvider, DefaultTheme,
} from 'expo-router';
import * as Updates from 'expo-updates';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider, ActivityIndicator } from 'react-native-paper';
import { setAudioModeAsync } from 'expo-audio';
import { AuthProvider, useAuth } from '@/context/auth';
import { useFonts } from 'expo-font';
import { Assistant_400Regular, Assistant_600SemiBold, Assistant_700Bold } from '@expo-google-fonts/assistant';
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
// The navigator only mounts once the session is restored, and by then the
// address the browser opened is gone: a reload of /lessons/<id> fell back to
// the catalogue. Remember it here, before the router touches the URL, and go
// back to it once signed in -- also after signing in from a shared link.
const AUTH_PATHS = ['/', '/sign-in', '/sign-up'];
let pendingDeepLink: string | null = null;

if (Platform.OS === 'web') {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = 'he';
    document.documentElement.dir = 'rtl';
    // react-native-web reports isRTL=false, so react-native-paper gives every
    // Text an inline `direction: ltr` and `text-align: left` (the rnw atomic
    // class below). Hebrew then hugs the left edge and punctuation lands on
    // the wrong side. Undo both on web; native is flipped by the OS.
    const style = document.createElement('style');
    style.textContent = `
      html[dir="rtl"] [style*="direction: ltr"] { direction: rtl !important; }
      html[dir="rtl"] .r-textAlign-fdjqy7 { text-align: right; }
    `;
    document.head.appendChild(style);
  }
  if (typeof window !== 'undefined' && !AUTH_PATHS.includes(window.location.pathname)) {
    pendingDeepLink = window.location.pathname + window.location.search;
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
        {/* The navigator paints every screen with its theme background (light
            grey by default); transparent lets the paper texture show. */}
        <ThemeProvider value={NAV_THEME}>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { session, isLoading, isProfileLoading } = useAuth();
  // The theme's type scale names these families; rendering before they load
  // would flash the system font and then reflow every screen.
  const [fontsLoaded, fontError] = useFonts({
    Assistant_400Regular, Assistant_600SemiBold, Assistant_700Bold,
  });
  const ready = !isLoading && !isProfileLoading && (fontsLoaded || !!fontError);
  const router = useRouter();
  const navReady = !!useRootNavigationState()?.key;

  useEffect(() => {
    if (!ready || !navReady || !session || !pendingDeepLink) return;
    const target = pendingDeepLink;
    pendingDeepLink = null;
    router.replace(target as never);
  }, [ready, navReady, session, router]);

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
      {/* Warm paper with a fine grey grain, tiled. Screens are transparent and
          cards stay solid on top of it. */}
      <ImageBackground
        source={require('../assets/paper.png')}
        resizeMode="repeat"
        style={styles.column}
      >
        {/* BOTH groups must be guarded. Guarding only (auth) leaves (app) mounted
            for everyone, so a signed-out visitor lands on the catalogue and sits
            on a spinner while RLS refuses the query. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={!!session}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
      </ImageBackground>
    </View>
  );
}

const WEB_COLUMN = 600;

const NAV_THEME = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent', card: 'transparent' },
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: Platform.OS === 'web' ? '#EADCCD' : colors.background },
  column: Platform.OS === 'web'
    ? {
      flex: 1, width: '100%', maxWidth: WEB_COLUMN, alignSelf: 'center',
      backgroundColor: colors.background, overflow: 'hidden',
    }
    : { flex: 1, backgroundColor: colors.background },
});
