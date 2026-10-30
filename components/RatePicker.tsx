import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, fonts } from '@/lib/theme';

// Playback speed as three small pills; the selected one is filled. Each label
// is a left-to-right isolate, or RTL text would show 1× as ×1.
export default function RatePicker({ value, rates, onChange }: {
  value: string; rates: string[]; onChange: (rate: string) => void;
}) {
  return (
    <View style={styles.row}>
      <Text variant="bodySmall" style={styles.label}>מהירות</Text>
      {rates.map((r) => {
        const selected = r === value;
        return (
          <Pressable
            key={r}
            onPress={() => onChange(r)}
            style={[styles.pill, selected && styles.selected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.text, selected && styles.textSelected]}>{`\u2066${r}×\u2069`}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  label: { color: colors.textSecondary, marginEnd: 4 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.outline,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  text: { fontFamily: fonts.sansMedium, fontSize: 13, color: colors.textSecondary },
  textSelected: { color: '#fff' },
});
