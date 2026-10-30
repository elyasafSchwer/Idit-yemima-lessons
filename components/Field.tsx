import { forwardRef } from 'react';
import { Platform, StyleSheet, View, type TextInput as NativeTextInput } from 'react-native';
import { Text, TextInput, type TextInputProps } from 'react-native-paper';
import { colors } from '@/lib/theme';

// Paper's floating label assumes left-to-right on web (react-native-web never
// reports RTL): once the field has a value the label slides off to the left,
// out of view, and leaves a gap in the outline's top edge. On web the label is
// a caption above the field instead; native keeps Paper's floating label.
const Field = forwardRef<NativeTextInput, TextInputProps & { label?: string }>(
  ({ label, ...props }, ref) => {
    if (Platform.OS !== 'web' || !label) return <TextInput ref={ref} label={label} {...props} />;
    return (
      <View style={styles.wrap}>
        <Text variant="bodySmall" style={styles.caption}>{label}</Text>
        <TextInput ref={ref} {...props} />
      </View>
    );
  },
);
Field.displayName = 'Field';
export default Field;

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  caption: { color: colors.textSecondary },
});
