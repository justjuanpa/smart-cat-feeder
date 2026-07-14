import { useLocalSearchParams, router } from 'expo-router';
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

import { fetchPet, updatePet } from '@/utils/paws-data';

export default function EditPetScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('cat');
  const [breed, setBreed] = useState('');
  const [dailyLimit, setDailyLimit] = useState('');
  const [recognitionThreshold, setRecognitionThreshold] = useState('');
  const [marginThreshold, setMarginThreshold] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }

    fetchPet(id)
      .then((pet) => {
        setName(pet.name);
        setSpecies(pet.species);
        setBreed(pet.breed ?? '');
        setDailyLimit(String(Number(pet.daily_gram_limit)));
        setRecognitionThreshold(String(Math.round(pet.recognition_threshold * 100)));
        setMarginThreshold(String(Math.round(pet.margin_threshold * 100)));
      })
      .catch((error: Error) => Alert.alert('Could not load pet', error.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function savePet() {
    if (!id) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedSpecies = species.trim() || 'cat';
    const dailyGrams = Number(dailyLimit);
    const recognitionPercent = Number(recognitionThreshold);
    const marginPercent = Number(marginThreshold);

    if (!trimmedName) {
      Alert.alert('Missing name', 'Enter a pet name.');
      return;
    }

    if (!Number.isFinite(dailyGrams) || dailyGrams < 0) {
      Alert.alert('Invalid portion', 'Daily gram limit must be 0 or higher.');
      return;
    }

    if (!isValidPercent(recognitionPercent) || !isValidPercent(marginPercent)) {
      Alert.alert('Invalid threshold', 'Thresholds must be between 0 and 100.');
      return;
    }

    setSaving(true);

    try {
      await updatePet(id, {
        name: trimmedName,
        species: trimmedSpecies,
        breed: breed.trim() || null,
        daily_gram_limit: dailyGrams,
        recognition_threshold: recognitionPercent / 100,
        margin_threshold: marginPercent / 100,
      });
      router.back();
    } catch (error) {
      Alert.alert('Could not save pet', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
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
            <Text style={styles.eyebrow}>Pet Profile</Text>
            <Text style={styles.title}>Edit pet</Text>
            <Text style={styles.copy}>
              Update the profile details used by the mobile app and feeding rules.
            </Text>
          </View>

          <View style={styles.form}>
            <LabeledInput label="Name" onChangeText={setName} value={name} />
            <LabeledInput label="Species" onChangeText={setSpecies} value={species} />
            <LabeledInput label="Breed" onChangeText={setBreed} value={breed} />
            <LabeledInput
              keyboardType="numeric"
              label="Daily gram limit"
              onChangeText={setDailyLimit}
              value={dailyLimit}
            />
            <LabeledInput
              keyboardType="numeric"
              label="Recognition threshold (%)"
              onChangeText={setRecognitionThreshold}
              value={recognitionThreshold}
            />
            <LabeledInput
              keyboardType="numeric"
              label="Margin threshold (%)"
              onChangeText={setMarginThreshold}
              value={marginThreshold}
            />
          </View>

          <Pressable
            disabled={loading || saving}
            onPress={savePet}
            style={[styles.primaryButton, (loading || saving) && styles.disabledButton]}>
            <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save changes'}</Text>
          </Pressable>
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
  keyboardType = 'default',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor="#91A0B8"
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function isValidPercent(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
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
  disabledButton: {
    opacity: 0.7,
  },
});
