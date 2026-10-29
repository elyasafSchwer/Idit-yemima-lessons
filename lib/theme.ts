import { MD3LightTheme } from 'react-native-paper';

// Placeholder palette -- warm cream and plum, pending Idit's choice of name and
// branding. Every screen reads from `colors` below rather than hard-coding hex,
// so swapping the scheme is a one-file change.
export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#8E4162',
    primaryContainer: '#F6E3EA',
    secondary: '#B07A4F',
    secondaryContainer: '#F7ECE1',
    surface: '#FFFBF6',
    surfaceVariant: '#F3E9DE',
    background: '#FBF4EC',
    onSurface: '#33212A',
    onSurfaceVariant: '#6B5560',
    onBackground: '#33212A',
    onPrimary: '#FFFFFF',
    error: '#C0392B',
    outline: '#D7C3B4',
  },
};

export const colors = {
  background: '#FBF4EC',
  surface: '#FFFBF6',
  text: '#33212A',
  textSecondary: '#6B5560',
  primary: '#8E4162',
  primaryDark: '#6E3049',
  accent: '#B07A4F',
  outline: '#D7C3B4',
  locked: '#9A8B93',
  error: '#C0392B',
};

// Lessons are bought outside the app: Idit collects via Bit/Paybox on WhatsApp
// and opens access from her own admin screens.
export const WHATSAPP_URL = 'https://wa.me/972527710084';
