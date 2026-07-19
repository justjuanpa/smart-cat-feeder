import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePawsRealtime } from '@/hooks/use-paws-realtime';
import { useSupabaseSession } from '@/hooks/use-supabase-session';
import {
  fetchFeedingEvents,
  type FeedingEventRow,
} from '@/utils/paws-data';
import { formatGrams, formatTime } from '@/utils/formatters';

export default function ActivityScreen() {
  const { session } = useSupabaseSession();
  const [events, setEvents] = useState<FeedingEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextEvents = await fetchFeedingEvents();
      setEvents(nextEvents);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load activity.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadActivity();
    }
  }, [loadActivity, session?.user]);

  usePawsRealtime({
    userId: session?.user.id,
    onActivityChange: loadActivity,
  });

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
          {events.length === 0 ? (
            <Text style={styles.muted}>
              {loading ? 'Loading activity...' : 'No events yet. The Pi will add allow/deny events here.'}
            </Text>
          ) : (
            events.map((event) => (
              <View key={event.id} style={styles.eventRow}>
                <View style={styles.eventIcon}>
                  <MaterialIcons name={eventIcon(event.event_type)} size={20} color="#1D4FA3" />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.cardTitle}>{event.pets?.name ?? event.recognition_label ?? 'Unknown pet'}</Text>
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
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
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

  return parts.join(' · ');
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
    width: 40,
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
