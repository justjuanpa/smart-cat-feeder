import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePawsRealtime } from '@/hooks/use-paws-realtime';
import { useSupabaseSession } from '@/hooks/use-supabase-session';
import {
  fetchActivityFeedingEvents,
  fetchPets,
  type FeedingEventRow,
  type PetRow,
} from '@/utils/paws-data';
import { formatGrams, formatTime } from '@/utils/formatters';

const ACTIVITY_VISIBLE_LIMIT = 20;

export default function ActivityScreen() {
  const { session } = useSupabaseSession();
  const [events, setEvents] = useState<FeedingEventRow[]>([]);
  const [pets, setPets] = useState<PetRow[]>([]);
  const [failedAvatarIds, setFailedAvatarIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    const ownerId = session?.user.id;
    if (!ownerId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [nextEvents, nextPets] = await Promise.all([
        fetchActivityFeedingEvents(ACTIVITY_VISIBLE_LIMIT),
        fetchPets(ownerId),
      ]);
      setEvents(nextEvents);
      setPets(nextPets);
      setFailedAvatarIds(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load activity.');
    } finally {
      setLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    if (session?.user) {
      loadActivity();
    }
  }, [loadActivity, session?.user]);

  usePawsRealtime({
    userId: session?.user.id,
    onActivityChange: loadActivity,
  });

  const visibleEvents = collapseUnknownEvents(events, pets);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Feeding History</Text>
            <Text style={styles.title}>Activity</Text>
          </View>
          <Pressable onPress={loadActivity} style={styles.iconButton}>
            <MaterialIcons name="refresh" size={22} color="#1D4FA3" />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.cardTitle}>Backend error</Text>
            <Text style={styles.muted}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent events</Text>
          {visibleEvents.length === 0 ? (
            <Text style={styles.muted}>
              {loading ? 'Loading activity...' : 'No events yet. The Pi will add allow/deny events here.'}
            </Text>
          ) : (
            visibleEvents.map((event) => {
              const pet = petForEvent(event, pets);

              return (
                <View key={event.id} style={styles.eventRow}>
                  <PetAvatar
                    eventType={event.event_type}
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
                      {pet?.name ?? event.pets?.name ?? event.recognition_label ?? 'Unknown pet'}
                    </Text>
                    <Text style={styles.muted}>{eventSummary(event)}</Text>
                    {scheduledDispenseDetail(event) ? (
                      <Text style={styles.small}>{scheduledDispenseDetail(event)}</Text>
                    ) : null}
                  </View>
                  <View style={styles.eventMeta}>
                    <Text style={styles.small}>{formatTime(event.occurred_at)}</Text>
                    <Text style={styles.amount}>{formatEventAmount(event)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function collapseUnknownEvents(events: FeedingEventRow[], pets: PetRow[]) {
  const latestUnknownEvent = events.find((event) => isUnknownCvEvent(event, pets)) ?? null;
  const petEvents = events.filter((event) => !isUnknownCvEvent(event, pets));
  const collapsedEvents = latestUnknownEvent ? [latestUnknownEvent, ...petEvents] : petEvents;

  return collapsedEvents
    .sort((first, second) => new Date(second.occurred_at).getTime() - new Date(first.occurred_at).getTime())
    .slice(0, ACTIVITY_VISIBLE_LIMIT);
}

function isUnknownCvEvent(event: FeedingEventRow, pets: PetRow[]) {
  if (petForEvent(event, pets)) {
    return false;
  }

  const label = event.recognition_label?.trim().toLowerCase();
  return event.event_type === 'denied' || label === 'unknown' || label == null;
}

function PetAvatar({
  eventType,
  failedAvatarIds,
  onAvatarError,
  pet,
}: {
  eventType: string;
  failedAvatarIds: Set<string>;
  onAvatarError: (petId: string) => void;
  pet: PetRow | null;
}) {
  if (pet?.avatar_url && !failedAvatarIds.has(pet.id)) {
    return (
      <View style={styles.eventIcon}>
        <Image
          contentFit="cover"
          onError={() => onAvatarError(pet.id)}
          source={{ uri: pet.avatar_url }}
          style={styles.avatarImage}
        />
      </View>
    );
  }

  if (pet) {
    return (
      <View style={styles.eventIcon}>
        <Text style={styles.initial}>{pet.name[0]}</Text>
      </View>
    );
  }

  return (
    <View style={styles.eventIcon}>
      <MaterialIcons name={eventIcon(eventType)} size={20} color="#1D4FA3" />
    </View>
  );
}

function petForEvent(event: FeedingEventRow, pets: PetRow[]) {
  return (
    pets.find((pet) => pet.id === event.pet_id) ??
    pets.find(
      (pet) =>
        pet.name.toLowerCase() === event.recognition_label?.toLowerCase() ||
        pet.name.toLowerCase() === event.pets?.name?.toLowerCase(),
    ) ??
    null
  );
}

function eventIcon(type: string): keyof typeof MaterialIcons.glyphMap {
  if (type === 'scheduled_dry_run') {
    return 'schedule';
  }

  if (type === 'denied') {
    return 'block';
  }

  if (type === 'manual') {
    return 'touch-app';
  }

  return 'restaurant';
}

function eventSummary(event: FeedingEventRow) {
  if (isScheduledDispense(event)) {
    const payload = event.raw_payload ?? {};
    const context = payload.scheduled_context;
    const mealName =
      isRecord(context) && typeof context.meal_name === 'string'
        ? context.meal_name
        : 'Scheduled meal';
    const side = typeof payload.side === 'string' ? payload.side.toLowerCase() : 'bowl';

    return `${mealName} added ${formatEventAmount(event)} to the ${side} bowl.`;
  }

  if (event.notes) {
    return event.notes;
  }

  if (event.event_type === 'manual') {
    return 'Manual event from the mobile app.';
  }

  if (event.event_type === 'scheduled_dry_run') {
    return 'Scheduled meal dry-run decision.';
  }

  return `${event.event_type} event${event.authorized === false ? ': access denied' : ''}.`;
}

function scheduledDispenseDetail(event: FeedingEventRow) {
  if (!isScheduledDispense(event)) {
    return null;
  }

  const payload = event.raw_payload ?? {};
  const finalWeight = numberFromUnknown(payload.final_weight_grams ?? payload.latest_weight_grams);
  const context = payload.scheduled_context;
  const target =
    isRecord(context) ? numberFromUnknown(context.target_grams) : null;

  if (finalWeight == null && target == null) {
    return null;
  }

  const parts = [];
  if (finalWeight != null) {
    parts.push(`Bowl now ${formatGrams(finalWeight)}`);
  }
  if (target != null) {
    parts.push(`target ${formatGrams(target)}`);
  }

  return parts.join(' / ');
}

function formatEventAmount(event: FeedingEventRow) {
  if (event.amount_grams == null) {
    return '--';
  }

  return formatGrams(event.amount_grams);
}

function isScheduledDispense(event: FeedingEventRow) {
  return (
    event.event_type === 'dispensed' &&
    event.raw_payload?.access_lid_opened === false
  );
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
  eventRow: {
    alignItems: 'center',
    borderTopColor: '#E6EDF8',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 14,
  },
  eventIcon: {
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
  rowText: {
    flex: 1,
  },
  eventMeta: {
    alignItems: 'flex-end',
    gap: 2,
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
  small: {
    color: '#7A8BA6',
    fontSize: 12,
    lineHeight: 16,
  },
  amount: {
    color: '#10213F',
    fontSize: 15,
    fontWeight: '900',
  },
});
