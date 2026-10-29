import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { colors } from '@/lib/theme';

// Paper's Material 3 Appbar.Content silently ignores `subtitle`, so screens
// that need a second line pass this as the title instead. It stretches to the
// width the Appbar gives it and shrinks the font rather than clipping: on iOS,
// next to the admin button, the title was cut to a few letters.
export default function HeaderTitle({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <View style={styles.wrap}>
      <Text variant="titleLarge" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {title}
      </Text>
      {!!subtitle && (
        <Text variant="bodySmall" numberOfLines={1} style={styles.subtitle}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  subtitle: { color: colors.textSecondary },
});
