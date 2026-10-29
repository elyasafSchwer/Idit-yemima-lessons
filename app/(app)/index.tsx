import { Redirect } from 'expo-router';

export default function AppIndex() {
  // Idit and students land on the same catalogue; admin tools hang off it.
  return <Redirect href="/(app)/lessons" />;
}
