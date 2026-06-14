import { MaterialIcons } from '@expo/vector-icons';
import type { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Pet = {
  id: string;
  name: string;
  portion: string;
  status: string;
  color: string;
};

type FeedingEvent = {
  id: string;
  pet: string;
  time: string;
  amount: string;
  note: string;
};

const pets: Pet[] = [
  { id: 'milo', name: 'Milo', portion: '46 g', status: 'Next meal 6:30 PM', color: '#D97706' },
  { id: 'mimi', name: 'Mimi', portion: '38 g', status: 'Ate 2h ago', color: '#0F766E' },
];

const feedingEvents: FeedingEvent[] = [
  { id: '1', pet: 'Mimi', time: '2:14 PM', amount: '36 g', note: 'Recognized by camera' },
  { id: '2', pet: 'Milo', time: '8:05 AM', amount: '44 g', note: 'Bowl weight confirmed' },
  { id: '3', pet: 'Unknown pet', time: '7:58 AM', amount: '0 g', note: 'Access held for review' },
];

export default function DashboardScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <TextMuted>Smart Feeder</TextMuted>
            <TextTitle>Milo & Mimi</TextTitle>
          </View>
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <TextSmall style={styles.onlineText}>Online</TextSmall>
          </View>
        </View>

        <View style={styles.heroPanel}>
          <View style={styles.heroIcon}>
            <MaterialIcons name="camera-alt" size={28} color="#0F766E" />
          </View>
          <TextMuted>Camera guard</TextMuted>
          <TextHero>Last detection: Mimi</TextHero>
          <TextBody style={styles.heroCopy}>
            Feeder door stayed unlocked for the assigned portion and closed after the bowl weight
            stabilized.
          </TextBody>
          <View style={styles.metricRow}>
            <Metric label="Food left" value="72%" />
            <Metric label="Bowl" value="Clear" />
            <Metric label="Battery" value="Plugged" />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <TextSection>Today&apos;s portions</TextSection>
          <Pressable style={styles.textButton}>
            <TextButton>Adjust</TextButton>
          </Pressable>
        </View>

        <View style={styles.petGrid}>
          {pets.map((pet) => (
            <View key={pet.id} style={styles.petCard}>
              <View style={[styles.petAvatar, { backgroundColor: pet.color }]}>
                <TextInitial>{pet.name[0]}</TextInitial>
              </View>
              <TextCardTitle>{pet.name}</TextCardTitle>
              <TextMuted>{pet.status}</TextMuted>
              <View style={styles.portionRow}>
                <TextAmount>{pet.portion}</TextAmount>
                <TextSmall>daily target</TextSmall>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <TextSection>Recent activity</TextSection>
          <Pressable style={styles.textButton}>
            <TextButton>See all</TextButton>
          </Pressable>
        </View>

        <View style={styles.activityList}>
          {feedingEvents.map((event) => (
            <View key={event.id} style={styles.activityItem}>
              <View style={styles.activityIcon}>
                <MaterialIcons name="restaurant" size={20} color="#155E75" />
              </View>
              <View style={styles.activityText}>
                <TextCardTitle>{event.pet}</TextCardTitle>
                <TextMuted>{event.note}</TextMuted>
              </View>
              <View style={styles.activityMeta}>
                <TextSmall>{event.time}</TextSmall>
                <TextAmountSmall>{event.amount}</TextAmountSmall>
              </View>
            </View>
          ))}
        </View>

        <Pressable style={styles.primaryButton}>
          <MaterialIcons name="play-arrow" size={24} color="#FFFFFF" />
          <TextPrimaryButton>Dispense test portion</TextPrimaryButton>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <TextMetric>{value}</TextMetric>
      <TextSmall>{label}</TextSmall>
    </View>
  );
}

function TextTitle(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.title} />;
}

function TextHero(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.heroTitle} />;
}

function TextSection(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.sectionTitle} />;
}

function TextCardTitle(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.cardTitle} />;
}

function TextMuted({ style, ...props }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <TextBase {...props} style={[styles.muted, style]} />;
}

function TextBody({ style, ...props }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <TextBase {...props} style={[styles.body, style]} />;
}

function TextSmall({ style, ...props }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <TextBase {...props} style={[styles.small, style]} />;
}

function TextButton(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.buttonText} />;
}

function TextPrimaryButton(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.primaryButtonText} />;
}

function TextInitial(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.initial} />;
}

function TextAmount(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.amount} />;
}

function TextAmountSmall(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.amountSmall} />;
}

function TextMetric(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.metricValue} />;
}

function TextBase({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={style}>{children}</Text>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F2EA',
  },
  container: {
    padding: 20,
    paddingBottom: 36,
    gap: 20,
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
  onlineBadge: {
    alignItems: 'center',
    backgroundColor: '#E6F4EF',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  onlineDot: {
    backgroundColor: '#16A34A',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  onlineText: {
    color: '#166534',
    fontWeight: '700',
  },
  heroPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    gap: 10,
    padding: 18,
    shadowColor: '#172121',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: '#CCFBF1',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  heroTitle: {
    color: '#172121',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0,
  },
  heroCopy: {
    marginBottom: 6,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metric: {
    backgroundColor: '#F2F7F5',
    borderRadius: 8,
    flex: 1,
    padding: 12,
  },
  metricValue: {
    color: '#172121',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#172121',
    fontSize: 21,
    fontWeight: '800',
  },
  textButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  buttonText: {
    color: '#0F766E',
    fontSize: 15,
    fontWeight: '800',
  },
  petGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  petCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    flex: 1,
    gap: 8,
    padding: 14,
  },
  petAvatar: {
    alignItems: 'center',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  initial: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  portionRow: {
    borderTopColor: '#ECE4D9',
    borderTopWidth: 1,
    gap: 2,
    marginTop: 4,
    paddingTop: 10,
  },
  activityList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    overflow: 'hidden',
  },
  activityItem: {
    alignItems: 'center',
    borderBottomColor: '#EFE7DC',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  activityIcon: {
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  activityText: {
    flex: 1,
  },
  activityMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    padding: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  cardTitle: {
    color: '#172121',
    fontSize: 17,
    fontWeight: '800',
  },
  muted: {
    color: '#6B6259',
    fontSize: 14,
    lineHeight: 20,
  },
  body: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
  },
  small: {
    color: '#7C7066',
    fontSize: 12,
    lineHeight: 16,
  },
  amount: {
    color: '#172121',
    fontSize: 24,
    fontWeight: '900',
  },
  amountSmall: {
    color: '#172121',
    fontSize: 15,
    fontWeight: '800',
  },
});
