import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
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

import { useSupabaseSession } from '@/hooks/use-supabase-session';
import { createPet, fetchPet, updatePet, uploadPetProfileImage, uploadPetTrainingImages } from '@/utils/paws-data';

export default function EditPetScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { session } = useSupabaseSession();
  const [name, setName] = useState('');
  const [species, setSpecies] = useState('cat');
  const [breed, setBreed] = useState('');
  const [dailyLimit, setDailyLimit] = useState('40');
  const [recognitionThreshold, setRecognitionThreshold] = useState('70');
  const [marginThreshold, setMarginThreshold] = useState('8');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [trainingImageCount, setTrainingImageCount] = useState(0);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingTrainingPhotos, setUploadingTrainingPhotos] = useState(false);
  const editing = Boolean(id);

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
        setAvatarUrl(pet.avatar_url ?? null);
        setTrainingImageCount(pet.training_image_count ?? 0);
        setPhotoLoadFailed(false);
      })
      .catch((error: Error) => Alert.alert('Could not load pet', error.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function savePet() {
    const ownerId = session?.user.id;
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

    if (!ownerId) {
      Alert.alert('Not signed in', 'Sign in before editing pets.');
      return;
    }

    setSaving(true);

    try {
      const values = {
        name: trimmedName,
        species: trimmedSpecies,
        breed: breed.trim() || null,
        daily_gram_limit: dailyGrams,
        recognition_threshold: recognitionPercent / 100,
        margin_threshold: marginPercent / 100,
      };

      if (id) {
        await updatePet(id, values);
      } else {
        await createPet(ownerId, values);
      }

      router.back();
    } catch (error) {
      Alert.alert('Could not save pet', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  async function chooseProfilePhoto() {
    if (!id || !session?.user.id) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo library access to upload a pet picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    setUploadingPhoto(true);

    try {
      const uploaded = await uploadPetProfileImage({
        ownerId: session.user.id,
        petId: id,
        imageUri: result.assets[0].uri,
      });
      setAvatarUrl(uploaded.avatar_url);
      setPhotoLoadFailed(false);
    } catch (error) {
      Alert.alert('Could not upload photo', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function chooseTrainingPhotos() {
    if (!id || !session?.user.id) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo library access to upload recognition photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      quality: 0.85,
      selectionLimit: 12,
    });

    if (result.canceled) {
      return;
    }

    const imageUris = result.assets.map((asset) => asset.uri).filter(Boolean);
    if (imageUris.length === 0) {
      return;
    }

    setUploadingTrainingPhotos(true);

    try {
      const uploaded = await uploadPetTrainingImages({
        ownerId: session.user.id,
        petId: id,
        imageUris,
      });
      setTrainingImageCount((currentCount) => currentCount + uploaded.uploaded_count);
      Alert.alert(
        'Enrollment photos uploaded',
        `${uploaded.uploaded_count} photo${uploaded.uploaded_count === 1 ? '' : 's'} added. Rebuild the Pi recognition profiles before testing recognition.`,
      );
    } catch (error) {
      Alert.alert('Could not upload enrollment photos', error instanceof Error ? error.message : 'Try again in a moment.');
    } finally {
      setUploadingTrainingPhotos(false);
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
            <Text style={styles.title}>{editing ? 'Edit pet' : 'Add pet'}</Text>
            <Text style={styles.copy}>
              {editing
                ? 'Update the profile details used by the mobile app and feeding rules.'
                : 'Create a pet profile, then add photos for recognition enrollment.'}
            </Text>
          </View>

          {id ? (
            <View style={styles.photoCard}>
            <View style={styles.photoPreview}>
              {avatarUrl && !photoLoadFailed ? (
                <Image
                  contentFit="cover"
                  onError={() => setPhotoLoadFailed(true)}
                  source={{ uri: avatarUrl }}
                  style={styles.photo}
                />
              ) : (
                <Text style={styles.photoInitial}>{name.trim()[0] ?? '?'}</Text>
              )}
            </View>
            <View style={styles.photoText}>
              <Text style={styles.cardTitle}>Profile picture</Text>
              <Text style={styles.copy}>Choose a clear face photo from your phone.</Text>
              <Pressable
                disabled={loading || uploadingPhoto}
                onPress={chooseProfilePhoto}
                style={[styles.photoButton, (loading || uploadingPhoto) && styles.disabledButton]}>
                <Text style={styles.photoButtonText}>
                  {uploadingPhoto ? 'Uploading...' : avatarUrl ? 'Change photo' : 'Upload photo'}
                </Text>
              </Pressable>
            </View>
          </View>
          ) : null}

          {id ? (
            <View style={styles.photoCard}>
            <View style={styles.enrollmentIcon}>
              <Text style={styles.enrollmentCount}>{trainingImageCount}</Text>
              <Text style={styles.enrollmentLabel}>photos</Text>
            </View>
            <View style={styles.photoText}>
              <Text style={styles.cardTitle}>Recognition enrollment</Text>
              <Text style={styles.copy}>
                Add clear full-body and face photos from different angles. Aim for 8-12 photos per pet.
              </Text>
              <Pressable
                disabled={loading || uploadingTrainingPhotos}
                onPress={chooseTrainingPhotos}
                style={[styles.photoButton, (loading || uploadingTrainingPhotos) && styles.disabledButton]}>
                <Text style={styles.photoButtonText}>
                  {uploadingTrainingPhotos ? 'Uploading...' : 'Add recognition photos'}
                </Text>
              </Pressable>
            </View>
          </View>
          ) : null}

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
            <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Create pet'}</Text>
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
  photoCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E2F3',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
  },
  photoPreview: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 8,
    height: 82,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 82,
  },
  photo: {
    height: '100%',
    width: '100%',
  },
  photoInitial: {
    color: '#1D4FA3',
    fontSize: 34,
    fontWeight: '900',
  },
  enrollmentIcon: {
    alignItems: 'center',
    backgroundColor: '#EEF4FF',
    borderRadius: 8,
    height: 82,
    justifyContent: 'center',
    width: 82,
  },
  enrollmentCount: {
    color: '#1D4FA3',
    fontSize: 30,
    fontWeight: '900',
  },
  enrollmentLabel: {
    color: '#5F6F8C',
    fontSize: 12,
    fontWeight: '800',
  },
  photoText: {
    flex: 1,
    gap: 8,
  },
  photoButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#EEF4FF',
    borderColor: '#BFD0EC',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  photoButtonText: {
    color: '#1D4FA3',
    fontSize: 14,
    fontWeight: '900',
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
  cardTitle: {
    color: '#10213F',
    fontSize: 16,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
