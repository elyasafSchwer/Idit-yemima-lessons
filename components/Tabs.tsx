import { Platform, View } from 'react-native';
import { SegmentedButtons, type SegmentedButtonsProps } from 'react-native-paper';

// Paper rounds and borders the first segment as the LEFT end. Under
// dir="rtl" on web the first segment is drawn on the right, so its right edge
// was left open and the control looked cut off. On web, lay it out LTR with
// the segments reversed: the same right-to-left order, with correct edges.
// Native apps are RTL at the OS level and Paper handles them.
const LTR = { dir: 'ltr' } as object;

export default function Tabs(props: SegmentedButtonsProps) {
  if (Platform.OS !== 'web') return <SegmentedButtons {...props} />;
  return (
    <View {...LTR} style={props.style}>
      <SegmentedButtons {...props} style={undefined} buttons={[...props.buttons].reverse()} />
    </View>
  );
}
