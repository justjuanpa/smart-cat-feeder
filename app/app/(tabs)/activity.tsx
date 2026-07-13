import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePawsRealtime } from '@/hooks/use-paws-realtime';
import { useSupabaseSession } from '@/hooks/use-supabase-session';
import {
  fetchFeedingEvents,
  fetchPets,
  logManualFeedingEvent,
  type FeedingEventRow,
  type PetRow,
} from '@/utils/paws-data';
import { formatGrams, formatTime } from '@/utils/formatters';

export default function ActivityScreen() {
  const { session } = useSupabaseSession();
  const [events, setEvents] = useState<FeedingEventRow[]>([]);
  const [pets, setPets] = useState<PetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextEvents, nextPets] = await Promise.all([fetchFeedingEvents(), fetchPets()]);
      setEvents(nextEvents);
      setPets(nextPets);
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

  async function logDemoEvent() {
    if (!session?.user || pets.length === 0) {
      Alert.alert('No pet yet', 'Create pet profiles from the Pets tab first.');
      return;
    }

    setSaving(true);

    try {
      await logManualFeedingEvent(session.user.id, pets[0]);
      await loadActivity();
    } catch (eventError) {
      Alert.alert(
        'Could not log event',
        eventError instanceof Error ? eventError.message : 'Try again in a moment.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Feeding History</Text>
            <Text style={styles.title}>Activity</Text>
          </View>
          <Pressable onPress={loadActivity} style={styles.iconButton}>
            <MaterialIcons name="refresh" size={22} color="#0F766E" />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.cardTitle}>Backend error</Text>
            <Text style={styles.muted}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          disabled={saving}
          onPress={logDemoEvent}
          style={[styles.primaryButton, saving && styles.disabledButton]}>
          <MaterialIcons name="add-circle" size={22} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>{saving ? 'Logging...' : 'Log demo feeding event'}</Text>
        </Pressable>

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
                  <MaterialIcons name={eventIcon(event.event_type)} size={20} color="#155E75" />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.cardTitle}>{event.pets?.name ?? event.recognition_label ?? 'Unknown pet'}</Text>
                  <Text style={styles.muted}>{eventSummary(event)}</Text>
                </View>
                <View style={styles.eventMeta}>
                  <Text style={styles.small}>{formatTime(event.occurred_at)}</Text>
                  <Text style={styles.amount}>{formatGrams(event.amount_grams)}</Text>
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
  if (type === 'denied') {
    return 'block';
  }

  if (type === 'manual') {
    return 'touch-app';
  }

  return 'restaurant';
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
  eyebrow: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#172121',
    fontSize: 34,
    fontWeight: '900',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
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
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.7,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    gap: 14,
    padding: 16,
  },
  sectionTitle: {
    color: '#172121',
    fontSize: 21,
    fontWeight: '900',
  },
  eventRow: {
    alignItems: 'center',
    borderTopColor: '#EFE7DC',
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
    color: '#172121',
    fontSize: 16,
    fontWeight: '900',
  },
  muted: {
    color: '#6B6259',
    fontSize: 14,
    lineHeight: 20,
  },
  small: {
    color: '#7C7066',
    fontSize: 12,
    lineHeight: 16,
  },
  amount: {
    color: '#172121',
    fontSize: 15,
    fontWeight: '900',
  },
});
