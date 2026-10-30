import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { colors, fonts } from '@/lib/theme';

type Props = {
  value: string;
  onValueChange: (value: string) => void;
  buttons: { value: string; label: string }[];
  style?: StyleProp<ViewStyle>;
};

// Text tabs with an underline under the selected one, in place of Paper's
// segmented pill. A plain row, so it follows the page's right-to-left flow on
// every platform (Paper's segments were drawn left-to-right on web).
export default function Tabs({ value, onValueChange, buttons, style }: Props) {
  return (
    <View style={[styles.row, style]} accessibilityRole="tablist">
      {buttons.map((b) => {
        const selected = b.value === value;
        return (
          <Pressable
            key={b.value}
            onPress={() => onValueChange(b.value)}
            style={[styles.tab, selected && styles.selected]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{b.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outline,
  },
  // Equal-width tabs, so the underline is the same length whatever the label.
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1,
  },
  selected: { borderBottomColor: colors.primary },
  label: { fontFamily: fonts.sansMedium, fontSize: 15, color: colors.textSecondary },
  labelSelected: { color: colors.primary },
});
