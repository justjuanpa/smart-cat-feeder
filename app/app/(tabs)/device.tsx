import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePawsRealtime } from '@/hooks/use-paws-realtime';
import { useSupabaseSession } from '@/hooks/use-supabase-session';
import {
  fetchLatestDeviceStatus,
  fetchLatestScheduledDispenses,
  fetchPets,
  type DeviceStatusRow,
  type FeedingEventRow,
  type PetRow,
} from '@/utils/paws-data';
import { supabase } from '@/utils/supabase';
import { formatGrams, formatRelativeTime, formatTime } from '@/utils/formatters';

export default function DeviceScreen() {
  const { session } = useSupabaseSession();
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusRow | null>(null);
  const [latestScheduledDispenses, setLatestScheduledDispenses] = useState<FeedingEventRow[]>([]);
  const [pets, setPets] = useState<PetRow[]>([]);
  const [failedAvatarIds, setFailedAvatarIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDevice = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextStatus, nextScheduledDispenses, nextPets] = await Promise.all([
        fetchLatestDeviceStatus(),
        fetchLatestScheduledDispenses(),
        fetchPets(),
      ]);
      setDeviceStatus(nextStatus);
      setLatestScheduledDispenses(nextScheduledDispenses);
      setPets(nextPets);
      setFailedAvatarIds(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load device status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadDevice();
    }
  }, [loadDevice, session?.user]);

  usePawsRealtime({
    userId: session?.user.id,
    onDeviceStatusChange: loadDevice,
  });

  async function signOut() {
    await supabase.auth.signOut();
  }

  const online = Boolean(deviceStatus?.online);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Hardware</Text>
            <Text style={styles.title}>Device</Text>
          </View>
          <Pressable onPress={loadDevice} style={styles.iconButton}>
            <MaterialIcons name="refresh" size={22} color="#1D4FA3" />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <View style={[styles.statusDot, online ? styles.onlineDot : styles.offlineDot]} />
          <Text style={styles.heroLabel}>{deviceStatus?.devices?.name ?? 'PAWS Feeder'}</Text>
          <Text style={styles.heroTitle}>{online ? 'Online' : 'No heartbeat yet'}</Text>
          <Text style={styles.muted}>
            {deviceStatus
              ? `Last updated ${formatRelativeTime(deviceStatus.updated_at)}.`
              : 'Run the Raspberry Pi UART bridge to create the first status row.'}
          </Text>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.cardTitle}>Backend error</Text>
            <Text style={styles.muted}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.metricGrid}>
          <Metric label="Left bowl" value={formatBowlGrams(deviceStatus?.left_bowl_weight_grams ?? null)} />
          <Metric label="Right bowl" value={formatBowlGrams(deviceStatus?.right_bowl_weight_grams ?? null)} />
          <Metric label="Last motion" value={formatRelativeTime(deviceStatus?.last_motion_at ?? null)} />
          <Metric label="Last event" value={formatRelativeTime(deviceStatus?.last_event_at ?? null)} />
          <Metric label="Vision" value={deviceStatus?.vision_version ?? 'Unknown'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Last scheduled dispense by pet</Text>
          {pets.length > 0 ? (
            pets.map((pet) => {
              const latestDispense = latestScheduledDispenseForPet(latestScheduledDispenses, pet);

              return (
                <View key={pet.id} style={styles.lastDispenseRow}>
                  <PetAvatar
                    failedAvatarIds={failedAvatarIds}
                    onAvatarError={(petId) =>
                      setFailedAvatarIds((currentIds) => {
                        const nextIds = new Set(currentIds);
                        nextIds.add(petId);
                        return nextIds;
                      })
                    }
                    pet={pet}
                  />
                  <View style={styles.rowText}>
                    <Text style={styles.cardTitle}>
                      {pet.name}
                      {latestDispense ? ` at ${formatTime(latestDispense.occurred_at)}` : ''}
                    </Text>
                    <Text style={styles.muted}>
                      {latestDispense
                        ? scheduledDispenseSummary(latestDispense)
                        : 'No scheduled dispense reported yet.'}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.muted}>Create pet profiles to track scheduled dispenses per pet.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>System readiness</Text>
          <SetupRow done title="Supabase schema" detail="Tables and RLS are live" />
          <SetupRow done title="Mobile app backend" detail="Auth, profiles, events, and status connected" />
          <SetupRow done={online} title="Raspberry Pi bridge" detail={online ? 'Heartbeat received' : 'Waiting for Pi'} />
          <SetupRow done={latestScheduledDispenses.length > 0} title="Motors and sensors" detail={latestScheduledDispenses.length > 0 ? 'Scheduled dispense confirmed' : 'Waiting for scheduled dispense'} />
        </View>

        <Pressable onPress={signOut} style={styles.secondaryButton}>
          <MaterialIcons name="logout" size={20} color="#1D4FA3" />
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        </Pressable>

        {loading ? <Text style={styles.muted}>Refreshing device status...</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function formatBowlGrams(value: number | null) {
  return value == null ? '--' : formatGrams(value);
}

function PetAvatar({
  failedAvatarIds,
  onAvatarError,
  pet,
}: {
  failedAvatarIds: Set<string>;
  onAvatarError: (petId: string) => void;
  pet: PetRow;
}) {
  if (pet.avatar_url && !failedAvatarIds.has(pet.id)) {
    return (
      <View style={styles.petAvatar}>
        <Image
          contentFit="cover"
          onError={() => onAvatarError(pet.id)}
          source={{ uri: pet.avatar_url }}
          style={styles.avatarImage}
        />
      </View>
    );
  }

  return (
    <View style={styles.petAvatar}>
      <Text style={styles.initial}>{pet.name[0]}</Text>
    </View>
  );
}

function latestScheduledDispenseForPet(events: FeedingEventRow[], pet: PetRow) {
  return (
    events.find((event) => event.pet_id === pet.id) ??
    events.find(
      (event) =>
        event.recognition_label?.toLowerCase() === pet.name.toLowerCase() ||
        event.pets?.name?.toLowerCase() === pet.name.toLowerCase(),
    ) ??
    null
  );
}

function scheduledDispenseSummary(event: FeedingEventRow) {
  const payload = event.raw_payload ?? {};
  const context = payload.scheduled_context;
  const mealName =
    isRecord(context) && typeof context.meal_name === 'string'
      ? context.meal_name
      : 'Scheduled meal';
  const side = typeof payload.side === 'string' ? payload.side : null;
  const finalWeight = numberFromUnknown(payload.final_weight_grams ?? payload.latest_weight_grams);
  const amount = event.amount_grams == null ? null : formatGrams(event.amount_grams);
  const parts = [
    amount ? `${mealName} added ${amount}` : mealName,
    side ? `${side} bowl` : null,
    finalWeight != null ? `now ${formatGrams(finalWeight)}` : null,
  ].filter(Boolean);

  return parts.join(' / ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberFromUnknown(value: unknown) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function SetupRow({ title, detail, done }: { title: string; detail: string; done: boolean }) {
  return (
    <View style={styles.setupRow}>
      <View style={[styles.statusIcon, done ? styles.doneIcon : styles.pendingIcon]}>
        <MaterialIcons name={done ? 'check' : 'sync'} size={18} color={done ? '#166534' : '#92400E'} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.muted}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7FAFF',
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
  eyebrow: {
    color: '#1D4FA3',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#10213F',
    fontSize: 34,
    fontWeight: '900',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E2F3',
    borderWidth: 1,
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E2F3',
    borderWidth: 1,
    borderRadius: 8,
    gap: 10,
    padding: 18,
  },
  statusDot: {
    borderRadius: 7,
    height: 14,
    width: 14,
  },
  onlineDot: {
    backgroundColor: '#16A34A',
  },
  offlineDot: {
    backgroundColor: '#F59E0B',
  },
  heroLabel: {
    color: '#667085',
    fontSize: 14,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#10213F',
    fontSize: 28,
    fontWeight: '900',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metric: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E2F3',
    borderWidth: 1,
    borderRadius: 8,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 4,
    padding: 14,
  },
  metricValue: {
    color: '#10213F',
    fontSize: 17,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#7A8BA6',
    fontSize: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E2F3',
    borderWidth: 1,
    borderRadius: 8,
    gap: 14,
    padding: 16,
  },
  sectionTitle: {
    color: '#10213F',
    fontSize: 21,
    fontWeight: '900',
  },
  setupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  lastDispenseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  petAvatar: {
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 40,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  initial: {
    color: '#1D4FA3',
    fontSize: 18,
    fontWeight: '900',
  },
  statusIcon: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
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
  rowText: {
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#BFD0EC',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    padding: 16,
  },
  secondaryButtonText: {
    color: '#1D4FA3',
    fontSize: 16,
    fontWeight: '900',
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  cardTitle: {
    color: '#10213F',
    fontSize: 16,
    fontWeight: '900',
  },
  muted: {
    color: '#667085',
    fontSize: 14,
    lineHeight: 20,
  },
});
