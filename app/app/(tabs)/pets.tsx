import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSupabaseSession } from '@/hooks/use-supabase-session';
import {
  createDemoPetsAndSchedules,
  ensureProfile,
  fetchPets,
  fetchSchedules,
  type FeedingScheduleRow,
  type PetRow,
} from '@/utils/paws-data';
import { formatGrams, formatScheduleTime } from '@/utils/formatters';

const petColors = ['#D97706', '#0F766E', '#155E75', '#7C3AED'];

export default function PetsScreen() {
  const { session } = useSupabaseSession();
  const [pets, setPets] = useState<PetRow[]>([]);
  const [schedules, setSchedules] = useState<FeedingScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDemo, setSavingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPetData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextPets, nextSchedules] = await Promise.all([fetchPets(), fetchSchedules()]);
      setPets(nextPets);
      setSchedules(nextSchedules);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load pets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    ensureProfile(session.user.id, session.user.email)
      .then(loadPetData)
      .catch((profileError: Error) => setError(profileError.message));
  }, [loadPetData, session?.user]);

  async function createDemoData() {
    if (!session?.user) {
      return;
    }

    setSavingDemo(true);

    try {
      await createDemoPetsAndSchedules(session.user.id);
      await loadPetData();
    } catch (demoError) {
      Alert.alert(
        'Could not create demo data',
        demoError instanceof Error ? demoError.message : 'Try again in a moment.',
      );
    } finally {
      setSavingDemo(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Profiles & Meals</Text>
            <Text style={styles.title}>Pets</Text>
          </View>
          <Pressable onPress={loadPetData} style={styles.iconButton}>
            <MaterialIcons name="refresh" size={22} color="#0F766E" />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.cardTitle}>Backend error</Text>
            <Text style={styles.muted}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.sectionTitle}>Pet profiles</Text>
              <Text style={styles.muted}>Recognition thresholds and daily limits</Text>
            </View>
            <Pressable
              disabled={savingDemo}
              onPress={createDemoData}
              style={[styles.addButton, savingDemo && styles.disabledButton]}>
              <MaterialIcons name="add" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          {pets.length === 0 ? (
            <Text style={styles.muted}>
              {loading ? 'Loading pets...' : 'No pets yet. Press + to create Milo and Mimi.'}
            </Text>
          ) : (
            pets.map((pet, index) => (
              <View key={pet.id} style={styles.petRow}>
                <View style={[styles.avatar, { backgroundColor: petColors[index % petColors.length] }]}>
                  <Text style={styles.initial}>{pet.name[0]}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.cardTitle}>{pet.name}</Text>
                  <Text style={styles.muted}>{pet.breed ?? pet.species}</Text>
                </View>
                <View style={styles.rowMeta}>
                  <Text style={styles.amount}>{formatGrams(pet.daily_gram_limit)}/day</Text>
                  <Text style={styles.small}>{Math.round(pet.recognition_threshold * 100)}% threshold</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Meal schedule</Text>
          {schedules.length === 0 ? (
            <Text style={styles.muted}>No schedules yet. Create demo profiles to add breakfast and dinner.</Text>
          ) : (
            schedules.map((meal) => (
              <View key={meal.id} style={styles.scheduleRow}>
                <View style={styles.timePill}>
                  <Text style={styles.timeText}>{formatScheduleTime(meal.scheduled_time)}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.cardTitle}>{meal.meal_name}</Text>
                  <Text style={styles.muted}>
                    {meal.pets?.name ?? 'Pet'} gets {formatGrams(meal.portion_grams)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    gap: 14,
    padding: 16,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  disabledButton: {
    opacity: 0.7,
  },
  sectionTitle: {
    color: '#172121',
    fontSize: 21,
    fontWeight: '900',
  },
  petRow: {
    alignItems: 'center',
    borderTopColor: '#EFE7DC',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 14,
  },
  avatar: {
    alignItems: 'center',
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
  rowMeta: {
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
  amount: {
    color: '#172121',
    fontSize: 14,
    fontWeight: '900',
  },
  small: {
    color: '#7C7066',
    fontSize: 12,
  },
});
