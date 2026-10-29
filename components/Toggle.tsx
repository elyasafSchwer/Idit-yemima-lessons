import { Platform, View } from 'react-native';
import { Switch, type SwitchProps } from 'react-native-paper';

// react-native-web positions the switch thumb with a left-to-right transform,
// so under dir="rtl" an "on" thumb lands outside the track, over the label.
// Laying the switch itself out LTR fixes it; native switches flip correctly.
// The `direction` style is ignored by react-native-web, so this uses its `dir`
// prop, which the React Native types do not declare.
const LTR = { dir: 'ltr' } as object;

export default function Toggle(props: SwitchProps) {
  if (Platform.OS !== 'web') return <Switch {...props} />;
  return (
    <View {...LTR}>
      <Switch {...props} />
    </View>
  );
}

