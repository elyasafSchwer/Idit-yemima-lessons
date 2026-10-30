import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Menu, Text } from 'react-native-paper';
import {
  toHebrew, fromHebrew, gematria, monthsOfYear, hebrewMonthLength, hebrewMonthName,
} from '@/lib/hebrewDate';
import { colors } from '@/lib/theme';

type Props = {
  label: string;
  value: string;                       // 'YYYY-MM-DD', Gregorian
  onChange: (value: string) => void;
  years?: number[];                    // Hebrew years to offer
};

// Day / month / year picked in the Hebrew calendar. The value stays a
// Gregorian 'YYYY-MM-DD' string, which is what the date columns store.
export default function HebrewDatePicker({ label, value, onChange, years }: Props) {
  const [y, m, d] = value.split('-').map(Number);
  const h = toHebrew(y, m, d);
  const yearOptions = years ?? [h.year - 2, h.year - 1, h.year, h.year + 1, h.year + 2];

  // Changing month or year can leave the day past the end of the new month
  // (30 Cheshvan in a short year, or the 30th of a 29-day month).
  const set = (hy: number, hm: number, hd: number) => {
    const months = monthsOfYear(hy);
    let month = hm;
    if (!months.includes(month)) month = month === 13 ? 12 : month;   // Adar II outside a leap year
    const day = Math.min(hd, hebrewMonthLength(month, hy));
    onChange(fromHebrew(hy, month, day));
  };

  const days = Array.from({ length: hebrewMonthLength(h.month, h.year) }, (_, i) => i + 1);

  return (
    <View style={styles.wrap}>
      <Text variant="bodySmall" style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Picker
          text={gematria(h.day)}
          options={days.map((n) => ({ key: n, label: gematria(n) }))}
          onSelect={(n) => set(h.year, h.month, n)}
        />
        <Picker
          text={hebrewMonthName(h.month, h.year)}
          options={monthsOfYear(h.year).map((n) => ({ key: n, label: hebrewMonthName(n, h.year) }))}
          onSelect={(n) => set(h.year, n, h.day)}
          grow
        />
        <Picker
          text={gematria(h.year)}
          options={yearOptions.map((n) => ({ key: n, label: gematria(n) }))}
          onSelect={(n) => set(n, h.month, h.day)}
        />
      </View>
    </View>
  );
}

function Picker({ text, options, onSelect, grow }: {
  text: string;
  options: { key: number; label: string }[];
  onSelect: (key: number) => void;
  grow?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={grow ? styles.grow : undefined}>
      <Menu
        visible={open}
        onDismiss={() => setOpen(false)}
        anchor={(
          <Button mode="outlined" icon="chevron-down" contentStyle={styles.button} onPress={() => setOpen(true)}>
            {text}
          </Button>
        )}
      >
        <ScrollView style={styles.menu}>
          {options.map((o) => (
            <Menu.Item key={o.key} title={o.label} onPress={() => { setOpen(false); onSelect(o.key); }} />
          ))}
        </ScrollView>
      </Menu>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  label: { color: colors.textSecondary },
  row: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
  button: { flexDirection: 'row-reverse' },
  menu: { maxHeight: 320 },
});
