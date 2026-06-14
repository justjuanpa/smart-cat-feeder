import { MaterialIcons } from '@expo/vector-icons';
import type { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const schedule = [
  { time: '8:00 AM', label: 'Breakfast', portion: 'Milo 22 g / Mimi 18 g' },
  { time: '6:30 PM', label: 'Dinner', portion: 'Milo 24 g / Mimi 20 g' },
];

const setupItems = [
  { title: 'Backend API', detail: 'Waiting for endpoint connection', done: false },
  { title: 'Raspberry Pi camera', detail: 'YOLO pet detection script exists', done: true },
  { title: 'Feeder controller', detail: 'UART and load-cell firmware in progress', done: true },
];

export default function ManageScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <TextMuted>Controls</TextMuted>
            <TextTitle>Manage feeder</TextTitle>
          </View>
          <Pressable style={styles.iconButton}>
            <MaterialIcons name="settings" size={24} color="#172121" />
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <TextSection>Pet profiles</TextSection>
              <TextMuted>Recognition and portion rules</TextMuted>
            </View>
            <Pressable style={styles.addButton}>
              <MaterialIcons name="add" size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          <ProfileRow name="Milo" tag="Orange tabby" meal="46 g/day" confidence="92%" />
          <ProfileRow name="Mimi" tag="Tuxedo" meal="38 g/day" confidence="95%" />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <TextSection>Meal schedule</TextSection>
              <TextMuted>Automatic dispensing windows</TextMuted>
            </View>
            <Pressable style={styles.textButton}>
              <TextButton>Edit</TextButton>
            </Pressable>
          </View>

          {schedule.map((meal) => (
            <View key={meal.time} style={styles.scheduleRow}>
              <View style={styles.timePill}>
                <TextTime>{meal.time}</TextTime>
              </View>
              <View style={styles.rowText}>
                <TextCardTitle>{meal.label}</TextCardTitle>
                <TextMuted>{meal.portion}</TextMuted>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <TextSection>System readiness</TextSection>
          <TextMuted style={styles.readinessCopy}>
            These checkpoints line up the mobile app with the backend, camera model, and feeder
            device.
          </TextMuted>

          {setupItems.map((item) => (
            <View key={item.title} style={styles.setupRow}>
              <View style={[styles.statusIcon, item.done ? styles.doneIcon : styles.pendingIcon]}>
                <MaterialIcons
                  name={item.done ? 'check' : 'sync'}
                  size={18}
                  color={item.done ? '#166534' : '#92400E'}
                />
              </View>
              <View style={styles.rowText}>
                <TextCardTitle>{item.title}</TextCardTitle>
                <TextMuted>{item.detail}</TextMuted>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileRow({
  name,
  tag,
  meal,
  confidence,
}: {
  name: string;
  tag: string;
  meal: string;
  confidence: string;
}) {
  return (
    <View style={styles.profileRow}>
      <View style={styles.avatar}>
        <TextInitial>{name[0]}</TextInitial>
      </View>
      <View style={styles.rowText}>
        <TextCardTitle>{name}</TextCardTitle>
        <TextMuted>{tag}</TextMuted>
      </View>
      <View style={styles.profileMeta}>
        <TextAmount>{meal}</TextAmount>
        <TextSmall>{confidence} match</TextSmall>
      </View>
    </View>
  );
}

function TextTitle(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.title} />;
}

function TextSection(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.sectionTitle} />;
}

function TextCardTitle(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.cardTitle} />;
}

function TextMuted({ style, ...props }: PropsWithChildren<{ style?: object }>) {
  return <TextBase {...props} style={[styles.muted, style]} />;
}

function TextButton(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.buttonText} />;
}

function TextInitial(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.initial} />;
}

function TextAmount(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.amount} />;
}

function TextSmall(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.small} />;
}

function TextTime(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.timeText} />;
}

function TextBase({ children, style }: PropsWithChildren<{ style?: object | object[] }>) {
  return <Text style={style}>{children}</Text>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F2EA',
  },
  container: {
    gap: 18,
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: '#172121',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    gap: 14,
    padding: 16,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#172121',
    fontSize: 21,
    fontWeight: '800',
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  textButton: {
    padding: 6,
  },
  buttonText: {
    color: '#0F766E',
    fontSize: 15,
    fontWeight: '800',
  },
  profileRow: {
    alignItems: 'center',
    borderTopColor: '#EFE7DC',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 14,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#155E75',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  initial: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  rowText: {
    flex: 1,
  },
  profileMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  scheduleRow: {
    alignItems: 'center',
    borderTopColor: '#EFE7DC',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 14,
  },
  timePill: {
    backgroundColor: '#E6F4EF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  timeText: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '900',
  },
  readinessCopy: {
    marginTop: -8,
  },
  setupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  statusIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  doneIcon: {
    backgroundColor: '#DCFCE7',
  },
  pendingIcon: {
    backgroundColor: '#FEF3C7',
  },
  cardTitle: {
    color: '#172121',
    fontSize: 16,
    fontWeight: '800',
  },
  muted: {
    color: '#6B6259',
    fontSize: 14,
    lineHeight: 20,
  },
  amount: {
    color: '#172121',
    fontSize: 14,
    fontWeight: '900',
  },
  small: {
    color: '#7C7066',
    fontSize: 12,
    lineHeight: 16,
  },
});
