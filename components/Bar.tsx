import { StyleSheet, View } from 'react-native';
import { colors } from '@/lib/theme';

// Paper's ProgressBar reserves far more height than it draws on web, which
// pushes whatever follows it down the screen. A plain bar is enough.
export default function Bar({ percent, height }: { percent: number; height: number }) {
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, percent))}%`, borderRadius: height / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.outline, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.primary },
});
