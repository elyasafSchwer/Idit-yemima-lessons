import { Platform } from 'react-native';
import { Appbar } from 'react-native-paper';

// Paper mirrors its back arrow only when I18nManager reports RTL, which
// react-native-web never does, so on web it pointed away from the page's
// right-to-left flow. Native apps are RTL at the OS level and flip it.
export default function BackAction({ onPress }: { onPress: () => void }) {
  if (Platform.OS === 'web') {
    return <Appbar.Action icon="arrow-right" onPress={onPress} accessibilityLabel="חזרה" />;
  }
  return <Appbar.BackAction onPress={onPress} />;
}
