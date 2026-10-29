import { View } from 'react-native';
import { Text } from 'react-native-paper';
import { colors } from '@/lib/theme';

// Paper's Material 3 Appbar.Content silently ignores `subtitle`, so screens
// that need a second line pass this as the title instead.
export default function HeaderTitle({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <View>
      <Text variant="titleLarge" numberOfLines={1}>{title}</Text>
      {!!subtitle && (
        <Text variant="bodySmall" numberOfLines={1} style={{ color: colors.textSecondary }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}
