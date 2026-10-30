import { StyleSheet } from 'react-native';
import { MD3LightTheme, configureFonts } from 'react-native-paper';

// Design direction: the app should feel like a well-made sefer, not a stock
// Android app. Hebrew book typography (Frank Ruhl Libre) for anything that is
// content -- titles, numbers, headings -- and a quiet sans (Assistant) for the
// interface around it. Flat paper surfaces with hairline rules instead of
// Material shadows and tinted bars; burgundy is kept for ink and accents.
// Every screen reads from `colors` and `fonts` below, so the scheme is still a
// one-file change.

export const colors = {
  background: '#F7F1E9',   // page
  surface: '#FFFDF9',      // cards, sheets
  text: '#2B1D23',         // ink
  textSecondary: '#76646C',
  primary: '#8E4162',      // burgundy
  primaryDark: '#5E2A40',
  primarySoft: '#F3E6EA',  // selected states, quiet fills
  accent: '#B07A4F',
  outline: '#E4D6C9',      // hairlines and borders
  locked: '#9A8B93',
  error: '#B3362C',
};

// Loaded in app/_layout.tsx with useFonts; the keys are the family names.
export const fonts = {
  serif: 'FrankRuhlLibre_500Medium',
  serifBold: 'FrankRuhlLibre_700Bold',
  sans: 'Assistant_400Regular',
  sansMedium: 'Assistant_600SemiBold',
};

const serif = (fontSize: number, lineHeight: number, fontFamily = fonts.serif) =>
  ({ fontFamily, fontSize, lineHeight, fontWeight: '400' as const, letterSpacing: 0 });
const sans = (fontSize: number, lineHeight: number, fontFamily = fonts.sans) =>
  ({ fontFamily, fontSize, lineHeight, fontWeight: '400' as const, letterSpacing: 0 });

export const theme = {
  ...MD3LightTheme,
  roundness: 3,
  fonts: configureFonts({
    config: {
      displayLarge: serif(48, 56, fonts.serifBold),
      displayMedium: serif(40, 48, fonts.serifBold),
      displaySmall: serif(34, 42, fonts.serifBold),
      headlineLarge: serif(30, 38, fonts.serifBold),
      headlineMedium: serif(26, 34),
      headlineSmall: serif(23, 30),
      titleLarge: serif(21, 28),
      titleMedium: serif(18, 25),
      titleSmall: sans(14, 20, fonts.sansMedium),
      labelLarge: sans(15, 20, fonts.sansMedium),
      labelMedium: sans(13, 18, fonts.sansMedium),
      labelSmall: sans(12, 16, fonts.sansMedium),
      bodyLarge: sans(17, 26),
      bodyMedium: sans(15, 23),
      bodySmall: sans(13, 19),
      default: sans(15, 23),
    },
  }),
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    onPrimary: '#FFFFFF',
    primaryContainer: colors.primarySoft,
    onPrimaryContainer: colors.primaryDark,
    secondary: colors.accent,
    secondaryContainer: colors.primarySoft,
    onSecondaryContainer: colors.primaryDark,
    surface: colors.surface,
    surfaceVariant: colors.background,
    background: colors.background,
    onSurface: colors.text,
    onSurfaceVariant: colors.textSecondary,
    onBackground: colors.text,
    outline: colors.outline,
    outlineVariant: colors.outline,
    error: colors.error,
    // MD3 tints every raised surface with the primary colour; flatten them all
    // to paper so nothing reads as a purple-washed Android bar.
    elevation: {
      level0: 'transparent',
      level1: colors.surface,
      level2: colors.surface,
      level3: colors.surface,
      level4: colors.surface,
      level5: colors.surface,
    },
  },
};

// Top bars: page-coloured with a hairline underneath, not a raised tinted bar.
export const appbarStyle = {
  backgroundColor: colors.background,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: colors.outline,
};

// Shown in the catalogue header and on the lock screen. Temporary, like the
// rest of the branding, until Idit picks a name.
export const APP_NAME = 'שיעורי עידית בתורת ימימה';

// Lessons are bought outside the app: Idit collects via Bit/Paybox on WhatsApp
// and opens access from her own admin screens.
export const WHATSAPP_URL = 'https://wa.me/972527710084';
