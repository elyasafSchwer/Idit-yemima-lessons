import { StyleSheet } from 'react-native';
import { MD3LightTheme, configureFonts } from 'react-native-paper';

// Design direction: calm and grown-up rather than stock Android. One family,
// Assistant, throughout, with weight doing the work of hierarchy. Flat paper
// surfaces with hairline rules instead of Material shadows and tinted bars,
// on a lightly textured paper background; burgundy is kept for ink and accents.
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
  heading: 'Assistant_600SemiBold',
  headingBold: 'Assistant_700Bold',
  sans: 'Assistant_400Regular',
  sansMedium: 'Assistant_600SemiBold',
};

const heading = (fontSize: number, lineHeight: number, fontFamily = fonts.heading) =>
  ({ fontFamily, fontSize, lineHeight, fontWeight: '400' as const, letterSpacing: 0 });
const sans = (fontSize: number, lineHeight: number, fontFamily = fonts.sans) =>
  ({ fontFamily, fontSize, lineHeight, fontWeight: '400' as const, letterSpacing: 0 });

export const theme = {
  ...MD3LightTheme,
  roundness: 3,
  fonts: configureFonts({
    config: {
      displayLarge: heading(48, 56, fonts.headingBold),
      displayMedium: heading(40, 48, fonts.headingBold),
      displaySmall: heading(34, 42, fonts.headingBold),
      headlineLarge: heading(30, 38, fonts.headingBold),
      headlineMedium: heading(26, 34),
      headlineSmall: heading(23, 30),
      titleLarge: heading(21, 28),
      titleMedium: heading(18, 25),
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

// Top bars: transparent over the paper with a hairline underneath, not a
// raised tinted bar.
export const appbarStyle = {
  backgroundColor: 'transparent',
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: colors.outline,
};

// Shown in the catalogue header and on the lock screen. Temporary, like the
// rest of the branding, until Idit picks a name.
export const APP_NAME = 'שיעורי עידית בתורת ימימה';

// Lessons are bought outside the app: Idit collects via Bit/Paybox on WhatsApp
// and opens access from her own admin screens.
export const WHATSAPP_URL = 'https://wa.me/972527710084';
