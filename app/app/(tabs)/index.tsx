import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSupabaseSession } from '@/hooks/use-supabase-session';
import {
  fetchLatestDeviceStatus,
  fetchFeedingEvents,
  fetchPets,
  logManualFeedingEvent,
  type DeviceStatusRow,
  type FeedingEventRow,
  type PetRow,
} from '@/utils/paws-data';

const petColors = ['#D97706', '#0F766E', '#155E75', '#7C3AED'];

export default function DashboardScreen() {
  const { session, loading: sessionLoading } = useSupabaseSession();
  const [pets, setPets] = useState<PetRow[]>([]);
  const [feedingEvents, setFeedingEvents] = useState<FeedingEventRow[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingEvent, setSavingEvent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextPets, nextEvents, nextDeviceStatus] = await Promise.all([
        fetchPets(),
        fetchFeedingEvents(),
        fetchLatestDeviceStatus(),
      ]);
      setPets(nextPets);
      setFeedingEvents(nextEvents);
      setDeviceStatus(nextDeviceStatus);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) {
      return;
    }

    if (!session?.user) {
      setLoading(false);
      return;
    }

    loadDashboard();
  }, [loadDashboard, session?.user, sessionLoading]);

  async function logDemoEvent() {
    if (!session?.user || pets.length === 0) {
      Alert.alert('No pet yet', 'Create demo pets on the Manage tab first.');
      return;
    }

    setSavingEvent(true);

    try {
      await logManualFeedingEvent(session.user.id, pets[0]);
      await loadDashboard();
    } catch (eventError) {
      Alert.alert(
        'Could not log event',
        eventError instanceof Error ? eventError.message : 'Try again in a moment.',
      );
    } finally {
      setSavingEvent(false);
    }
  }

  const latestEvent = feedingEvents[0];
  const title = pets.length > 0 ? pets.map((pet) => pet.name).join(' & ') : 'PAWS Feeder';
  const deviceLabel = formatDeviceLabel(deviceStatus);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <TextMuted>Smart Feeder</TextMuted>
            <TextTitle>{title}</TextTitle>
          </View>
          <View style={styles.onlineBadge}>
            <View style={styles.onlineDot} />
            <TextSmall style={styles.onlineText}>Backend live</TextSmall>
          </View>
        </View>

        <View style={styles.heroPanel}>
          <View style={styles.heroIcon}>
            <MaterialIcons name="camera-alt" size={28} color="#0F766E" />
          </View>
          <TextMuted>Camera guard</TextMuted>
          <TextHero>
            {latestEvent?.recognition_label
              ? `Last event: ${latestEvent.recognition_label}`
              : 'Waiting for first event'}
          </TextHero>
          <TextBody style={styles.heroCopy}>
            {latestEvent
              ? eventSummary(latestEvent)
              : 'The Raspberry Pi will log automatic recognition and feeding events here once it is connected.'}
          </TextBody>
          <View style={styles.metricRow}>
            <Metric label="Pets" value={String(pets.length)} />
            <Metric label="Events" value={String(feedingEvents.length)} />
            <Metric label="Device" value={deviceLabel.metric} />
          </View>
        </View>

        {error ? (
          <View style={styles.errorPanel}>
            <TextCardTitle>Backend error</TextCardTitle>
            <TextMuted>{error}</TextMuted>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <TextSection>Today&apos;s portions</TextSection>
          <Pressable onPress={loadDashboard} style={styles.textButton}>
            <TextButton>{loading ? 'Loading' : 'Refresh'}</TextButton>
          </Pressable>
        </View>

        {pets.length === 0 ? (
          <EmptyState text="No pets yet. Use the Manage tab to add demo pets from Supabase." />
        ) : (
          <View style={styles.petGrid}>
            {pets.map((pet, index) => (
              <View key={pet.id} style={styles.petCard}>
                <View style={[styles.petAvatar, { backgroundColor: petColors[index % petColors.length] }]}>
                  <TextInitial>{pet.name[0]}</TextInitial>
                </View>
                <TextCardTitle>{pet.name}</TextCardTitle>
                <TextMuted>{pet.breed ?? pet.species}</TextMuted>
                <View style={styles.portionRow}>
                  <TextAmount>{formatGrams(pet.daily_gram_limit)}</TextAmount>
                  <TextSmall>daily target</TextSmall>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <TextSection>Device status</TextSection>
          <Pressable onPress={loadDashboard} style={styles.textButton}>
            <TextButton>Refresh</TextButton>
          </Pressable>
        </View>

        {deviceStatus ? (
          <View style={styles.deviceCard}>
            <View style={styles.deviceCardHeader}>
              <View style={styles.deviceIcon}>
                <MaterialIcons name="memory" size={22} color="#0F766E" />
              </View>
              <View style={styles.activityText}>
                <TextCardTitle>{deviceStatus.devices?.name ?? 'PAWS Feeder'}</TextCardTitle>
                <TextMuted>{deviceLabel.description}</TextMuted>
              </View>
              <View style={[styles.statusPill, deviceStatus.online ? styles.onlinePill : styles.offlinePill]}>
                <TextSmall style={deviceStatus.online ? styles.onlinePillText : styles.offlinePillText}>
                  {deviceStatus.online ? 'Online' : 'Offline'}
                </TextSmall>
              </View>
            </View>
            <View style={styles.deviceMetricRow}>
              <Metric label="Bowl weight" value={formatGrams(deviceStatus.current_weight_grams)} />
              <Metric label="Motion" value={formatRelativeTime(deviceStatus.last_motion_at)} />
            </View>
          </View>
        ) : (
          <EmptyState text="No device status yet. Once the Raspberry Pi starts sending heartbeats, this card will show feeder health." />
        )}

        <View style={styles.sectionHeader}>
          <TextSection>Recent activity</TextSection>
          <Pressable onPress={loadDashboard} style={styles.textButton}>
            <TextButton>See all</TextButton>
          </Pressable>
        </View>

        {feedingEvents.length === 0 ? (
          <EmptyState text="No feeding events yet. Log a demo event, then the Pi will take over later." />
        ) : (
          <View style={styles.activityList}>
            {feedingEvents.map((event) => (
              <View key={event.id} style={styles.activityItem}>
                <View style={styles.activityIcon}>
                  <MaterialIcons name="restaurant" size={20} color="#155E75" />
                </View>
                <View style={styles.activityText}>
                  <TextCardTitle>{event.pets?.name ?? event.recognition_label ?? 'Unknown pet'}</TextCardTitle>
                  <TextMuted>{eventSummary(event)}</TextMuted>
                </View>
                <View style={styles.activityMeta}>
                  <TextSmall>{formatTime(event.occurred_at)}</TextSmall>
                  <TextAmountSmall>{formatGrams(event.amount_grams)}</TextAmountSmall>
                </View>
              </View>
            ))}
          </View>
        )}

        <Pressable
          disabled={savingEvent}
          onPress={logDemoEvent}
          style={[styles.primaryButton, savingEvent && styles.disabledButton]}>
          <MaterialIcons name="play-arrow" size={24} color="#FFFFFF" />
          <TextPrimaryButton>{savingEvent ? 'Logging...' : 'Log demo feeding event'}</TextPrimaryButton>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDeviceLabel(status: DeviceStatusRow | null) {
  if (!status) {
    return {
      metric: 'Pending',
      description: 'Waiting for the feeder to report status.',
    };
  }

  return {
    metric: status.online ? 'Online' : 'Offline',
    description: `Last update ${formatRelativeTime(status.updated_at)}${
      status.firmware_version ? `, firmware ${status.firmware_version}` : ''
    }`,
  };
}

function eventSummary(event: FeedingEventRow) {
  if (event.notes) {
    return event.notes;
  }

  if (event.event_type === 'manual') {
    return 'Manual event from the mobile app.';
  }

  return `${event.event_type} event${event.authorized === false ? ': access denied' : ''}.`;
}

function formatGrams(value: number | null) {
  if (value == null) {
    return '0 g';
  }

  return `${Number(value).toFixed(0)} g`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatRelativeTime(value: string | null) {
  if (!value) {
    return 'None';
  }

  const timestamp = new Date(value).getTime();
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) {
    return 'Now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);

  return `${diffDays}d ago`;
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyState}>
      <TextMuted>{text}</TextMuted>
    </View>
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
    gap: 12,
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
    flexWrap: 'wrap',
    gap: 12,
  },
  petCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    flexBasis: '47%',
    flexGrow: 1,
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
  deviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    gap: 14,
    padding: 16,
  },
  deviceCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  deviceIcon: {
    alignItems: 'center',
    backgroundColor: '#CCFBF1',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  onlinePill: {
    backgroundColor: '#DCFCE7',
  },
  offlinePill: {
    backgroundColor: '#FEF3C7',
  },
  onlinePillText: {
    color: '#166534',
    fontWeight: '800',
  },
  offlinePillText: {
    color: '#92400E',
    fontWeight: '800',
  },
  deviceMetricRow: {
    flexDirection: 'row',
    gap: 10,
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
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  errorPanel: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
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
