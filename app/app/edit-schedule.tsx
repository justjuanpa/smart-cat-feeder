import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSupabaseSession } from '@/hooks/use-supabase-session';
import {
  createSchedule,
  deleteSchedule,
  fetchPets,
  fetchSchedule,
  updateSchedule,
  type PetRow,
} from '@/utils/paws-data';

const DEFAULT_SCHEDULE_TIME = '08:00';

export default function EditScheduleScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useSupabaseSession();
  const [pets, setPets] = useState<PetRow[]>([]);
  const [petId, setPetId] = useState('');
  const [mealName, setMealName] = useState('');
  const [scheduledTime, setScheduledTime] = useState(formatTimeForInput(DEFAULT_SCHEDULE_TIME));
  const [portionGrams, setPortionGrams] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const editing = Boolean(id);

  useEffect(() => {
    let active = true;

    async function loadScheduleForm() {
      try {
        const nextPets = await fetchPets();

        if (!active) {
          return;
        }

        setPets(nextPets);
        setPetId(nextPets[0]?.id ?? '');

        if (id) {
          const schedule = await fetchSchedule(id);

          if (!active) {
            return;
          }

          setPetId(schedule.pet_id);
          setMealName(schedule.meal_name);
          setScheduledTime(formatTimeForInput(schedule.scheduled_time.slice(0, 5)));
          setPortionGrams(String(Number(schedule.portion_grams)));
          setEnabled(schedule.enabled);
        }
      } catch (error) {
        Alert.alert('Could not load schedule', error instanceof Error ? error.message : 'Try again in a moment.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadScheduleForm();

    return () => {
      active = false;
    };
  }, [id]);

  async function saveSchedule() {
    const ownerId = session?.user.id;
    const trimmedMealName = mealName.trim();
    const normalizedTime = normalizeTimeInput(scheduledTime);
    const grams = Number(portionGrams);

    if (!ownerId) {
      Alert.alert('Not signed in', 'Sign in before editing schedules.');
      return;
    }

    if (!petId) {
      Alert.alert('Choose a pet', 'Select which pet this meal is for.');
      return;
    }

    if (!trimmedMealName) {
      Alert.alert('Missing meal name', 'Enter a name like Breakfast or Dinner.');
      return;
    }

    if (!normalizedTime) {
      Alert.alert('Invalid time', 'Use a time like 8:00 AM, 3 PM, or 6:30 PM.');
      return;
    }

    if (!Number.isFinite(grams) || grams < 0) {
      Alert.alert('Invalid portion', 'Portion grams must be 0 or higher.');
      return;
    }

    setSaving(true);

    try {
      const values = {
        pet_id: petId,
        meal_name: trimmedMealName,
        scheduled_time: normalizedTime,
        portion_grams: grams,
        enabled,
      };

      if (id) {
        await updateSchedule(id, values);
      } else {
        await createSchedule(ownerId, values);
      }

      router.back();
    } catch (error) {
      Alert.alert('Could not save schedule', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!id) {
      return;
    }

    Alert.alert('Delete meal?', 'This removes the meal from the schedule.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);

          try {
            await deleteSchedule(id);
            router.back();
          } catch (error) {
            Alert.alert('Could not delete schedule', error instanceof Error ? error.message : 'Try again in a moment.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View>
            <Text style={styles.eyebrow}>Meal Schedule</Text>
            <Text style={styles.title}>{editing ? 'Edit meal' : 'Add meal'}</Text>
            <Text style={styles.copy}>Set when each pet should be fed and how much food to target.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Pet</Text>
              <View style={styles.petChoices}>
                {pets.map((pet) => (
                  <Pressable
                    key={pet.id}
                    onPress={() => setPetId(pet.id)}
                    style={[styles.choiceButton, petId === pet.id && styles.choiceButtonSelected]}>
                    <Text style={[styles.choiceText, petId === pet.id && styles.choiceTextSelected]}>
                      {pet.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {pets.length === 0 ? <Text style={styles.muted}>Create a pet profile before adding meals.</Text> : null}
            </View>

            <LabeledInput label="Meal name" onChangeText={setMealName} value={mealName} />
            <LabeledInput
              helperText="Examples: 8:00 AM, 3 PM, 6:30 PM"
              keyboardType="numbers-and-punctuation"
              label="Time"
              onBlur={() => {
                const normalizedTime = normalizeTimeInput(scheduledTime);
                if (normalizedTime) {
                  setScheduledTime(formatTimeForInput(normalizedTime));
                }
              }}
              onChangeText={setScheduledTime}
              value={scheduledTime}
            />
            <LabeledInput
              keyboardType="numeric"
              label="Portion grams"
              onChangeText={setPortionGrams}
              value={portionGrams}
            />

            <Pressable onPress={() => setEnabled((value) => !value)} style={styles.toggleRow}>
              <View style={[styles.checkbox, enabled && styles.checkboxSelected]}>
                {enabled ? <MaterialIcons name="check" size={18} color="#FFFFFF" /> : null}
              </View>
              <View style={styles.rowText}>
                <Text style={styles.label}>Enabled</Text>
                <Text style={styles.muted}>{enabled ? 'This meal is active.' : 'This meal is paused.'}</Text>
              </View>
            </Pressable>
          </View>

          <Pressable
            disabled={loading || saving || pets.length === 0}
            onPress={saveSchedule}
            style={[styles.primaryButton, (loading || saving || pets.length === 0) && styles.disabledButton]}>
            <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save meal'}</Text>
          </Pressable>

          {id ? (
            <Pressable disabled={saving} onPress={confirmDelete} style={styles.dangerButton}>
              <Text style={styles.dangerButtonText}>Delete meal</Text>
            </Pressable>
          ) : null}

          <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LabeledInput({
  label,
  value,
  onChangeText,
  onBlur,
  keyboardType = 'default',
  helperText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  keyboardType?: 'default' | 'numeric' | 'numbers-and-punctuation';
  helperText?: string;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        onBlur={onBlur}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor="#91A0B8"
        style={styles.input}
        value={value}
      />
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
    </View>
  );
}

function normalizeTimeInput(value: string) {
  const trimmed = value.trim();
  const twentyFourHourMatch = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (twentyFourHourMatch) {
    return `${twentyFourHourMatch[1].padStart(2, '0')}:${twentyFourHourMatch[2]}`;
  }

  const standardTimeMatch = /^(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?\s*m?\.?$/i.exec(trimmed);
  if (!standardTimeMatch) {
    return null;
  }

  const hour = Number(standardTimeMatch[1]);
  const minutes = standardTimeMatch[2] ?? '00';
  const meridiem = standardTimeMatch[3].toLowerCase();

  if (hour < 1 || hour > 12) {
    return null;
  }

  const normalizedHour = meridiem === 'p' ? (hour % 12) + 12 : hour % 12;
  return `${String(normalizedHour).padStart(2, '0')}:${minutes}`;
}

function formatTimeForInput(value: string) {
  const normalizedTime = normalizeTimeInput(value);
  if (!normalizedTime) {
    return value;
  }

  const [hours, minutes] = normalizedTime.split(':').map(Number);
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;

  return `${hour}:${String(minutes).padStart(2, '0')} ${meridiem}`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7FAFF',
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    gap: 18,
    padding: 20,
    paddingBottom: 36,
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
  copy: {
    color: '#667085',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E2F3',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    color: '#10213F',
    fontSize: 13,
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#F7FAFF',
    borderColor: '#D8E2F3',
    borderRadius: 8,
    borderWidth: 1,
    color: '#10213F',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  petChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceButton: {
    backgroundColor: '#EEF4FF',
    borderColor: '#D8E2F3',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  choiceButtonSelected: {
    backgroundColor: '#1D4FA3',
    borderColor: '#1D4FA3',
  },
  choiceText: {
    color: '#1D4FA3',
    fontSize: 14,
    fontWeight: '900',
  },
  choiceTextSelected: {
    color: '#FFFFFF',
  },
  toggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  checkbox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#BFD0EC',
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  checkboxSelected: {
    backgroundColor: '#1D4FA3',
    borderColor: '#1D4FA3',
  },
  rowText: {
    flex: 1,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1D4FA3',
    borderRadius: 8,
    padding: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#BFD0EC',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  secondaryButtonText: {
    color: '#1D4FA3',
    fontSize: 16,
    fontWeight: '900',
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  dangerButtonText: {
    color: '#B91C1C',
    fontSize: 16,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.7,
  },
  muted: {
    color: '#667085',
    fontSize: 14,
    lineHeight: 20,
  },
  helperText: {
    color: '#667085',
    fontSize: 12,
    lineHeight: 18,
  },
});
