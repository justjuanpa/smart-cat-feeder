import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';

import { supabase } from '@/utils/supabase';

export type PetRow = {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  daily_gram_limit: number;
  recognition_threshold: number;
  margin_threshold: number;
  active: boolean;
  avatar_url?: string | null;
};

export type PetUpdate = {
  name: string;
  species: string;
  breed: string | null;
  daily_gram_limit: number;
  recognition_threshold: number;
  margin_threshold: number;
};

export type FeedingScheduleRow = {
  id: string;
  pet_id: string;
  meal_name: string;
  scheduled_time: string;
  portion_grams: number;
  enabled: boolean;
  pets?: Pick<PetRow, 'name'> | null;
};

export type FeedingScheduleWrite = {
  pet_id: string;
  meal_name: string;
  scheduled_time: string;
  portion_grams: number;
  enabled: boolean;
};

export type FeedingEventRow = {
  id: string;
  pet_id: string | null;
  event_type: string;
  occurred_at: string;
  authorized: boolean | null;
  amount_grams: number | null;
  recognition_label: string | null;
  recognition_confidence: number | null;
  notes: string | null;
  pets?: Pick<PetRow, 'name'> | null;
};

export type DeviceStatusRow = {
  device_id: string;
  owner_id: string;
  online: boolean;
  current_weight_grams: number | null;
  left_bowl_weight_grams: number | null;
  right_bowl_weight_grams: number | null;
  last_motion_at: string | null;
  last_event_at: string | null;
  firmware_version: string | null;
  vision_version: string | null;
  updated_at: string;
  devices?: {
    name: string;
    status: string;
    last_seen_at: string | null;
  } | null;
};

type DemoScheduleRow = {
  owner_id: string;
  pet_id: string;
  meal_name: string;
  scheduled_time: string;
  portion_grams: number;
};

type PetImageRow = {
  storage_path: string;
  image_role: string;
  created_at: string;
};

type PetWithImages = PetRow & {
  pet_images?: PetImageRow[] | null;
};

type RelatedPet = Pick<PetRow, 'name'> | Pick<PetRow, 'name'>[] | null;
type RelatedDevice =
  | {
      name: string;
      status: string;
      last_seen_at: string | null;
    }
  | {
      name: string;
      status: string;
      last_seen_at: string | null;
    }[]
  | null;

function normalizeRelatedPet(pet: RelatedPet) {
  return Array.isArray(pet) ? (pet[0] ?? null) : pet;
}

function normalizeRelatedDevice(device: RelatedDevice) {
  return Array.isArray(device) ? (device[0] ?? null) : device;
}

export async function ensureProfile(userId: string, displayName?: string | null) {
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    display_name: displayName ?? null,
  });

  if (error) {
    throw error;
  }
}

export async function fetchPets() {
  const { data, error } = await supabase
    .from('pets')
    .select(
      'id, name, species, breed, daily_gram_limit, recognition_threshold, margin_threshold, active, pet_images(storage_path, image_role, created_at)',
    )
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return attachPetAvatarUrls((data ?? []) as PetWithImages[]);
}

export async function fetchPet(petId: string) {
  const { data, error } = await supabase
    .from('pets')
    .select(
      'id, name, species, breed, daily_gram_limit, recognition_threshold, margin_threshold, active, pet_images(storage_path, image_role, created_at)',
    )
    .eq('id', petId)
    .single();

  if (error) {
    throw error;
  }

  const [pet] = await attachPetAvatarUrls([data as PetWithImages]);

  return pet;
}

export async function updatePet(petId: string, values: PetUpdate) {
  const { error } = await supabase
    .from('pets')
    .update(values)
    .eq('id', petId);

  if (error) {
    throw error;
  }
}

export async function uploadPetProfileImage({
  ownerId,
  petId,
  imageUri,
}: {
  ownerId: string;
  petId: string;
  imageUri: string;
}) {
  const previousProfileImages = await fetchPetProfileImagePaths(ownerId, petId);
  const extension = getImageExtension(imageUri);
  const contentType = getImageContentType(extension);
  const storagePath = `${ownerId}/${petId}/profile-${Date.now()}.${extension}`;
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { error: uploadError } = await supabase.storage
    .from('pet-images')
    .upload(storagePath, decode(base64), {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { error: imageError } = await supabase.from('pet_images').insert({
    owner_id: ownerId,
    pet_id: petId,
    storage_path: storagePath,
    image_role: 'profile',
  });

  if (imageError) {
    throw imageError;
  }

  const { error: petTouchError } = await supabase
    .from('pets')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', petId);

  if (petTouchError) {
    throw petTouchError;
  }

  const signedUrl = await createPetImageSignedUrl(storagePath);
  await deleteOldPetProfileImages(previousProfileImages);

  return {
    storage_path: storagePath,
    avatar_url: signedUrl,
  };
}

export async function fetchSchedules() {
  const { data, error } = await supabase
    .from('feeding_schedules')
    .select('id, pet_id, meal_name, scheduled_time, portion_grams, enabled, pets(name)')
    .order('scheduled_time', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((schedule) => ({
    ...schedule,
    pets: normalizeRelatedPet(schedule.pets),
  })) as FeedingScheduleRow[];
}

export async function fetchSchedule(scheduleId: string) {
  const { data, error } = await supabase
    .from('feeding_schedules')
    .select('id, pet_id, meal_name, scheduled_time, portion_grams, enabled, pets(name)')
    .eq('id', scheduleId)
    .single();

  if (error) {
    throw error;
  }

  return {
    ...data,
    pets: normalizeRelatedPet(data.pets),
  } as FeedingScheduleRow;
}

export async function createSchedule(ownerId: string, values: FeedingScheduleWrite) {
  const { error } = await supabase.from('feeding_schedules').insert({
    owner_id: ownerId,
    ...values,
  });

  if (error) {
    throw error;
  }
}

export async function updateSchedule(scheduleId: string, values: FeedingScheduleWrite) {
  const { error } = await supabase
    .from('feeding_schedules')
    .update(values)
    .eq('id', scheduleId);

  if (error) {
    throw error;
  }
}

export async function deleteSchedule(scheduleId: string) {
  const { error } = await supabase
    .from('feeding_schedules')
    .delete()
    .eq('id', scheduleId);

  if (error) {
    throw error;
  }
}

export async function fetchFeedingEvents() {
  const { data, error } = await supabase
    .from('feeding_events')
    .select(
      'id, pet_id, event_type, occurred_at, authorized, amount_grams, recognition_label, recognition_confidence, notes, pets(name)',
    )
    .order('occurred_at', { ascending: false })
    .limit(10);

  if (error) {
    throw error;
  }

  return (data ?? []).map((event) => ({
    ...event,
    pets: normalizeRelatedPet(event.pets),
  })) as FeedingEventRow[];
}

export async function fetchLatestDeviceStatus() {
  const { data, error } = await supabase
    .from('device_status')
    .select(
      'device_id, owner_id, online, current_weight_grams, left_bowl_weight_grams, right_bowl_weight_grams, last_motion_at, last_event_at, firmware_version, vision_version, updated_at, devices(name, status, last_seen_at)',
    )
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const status = data?.[0];

  if (!status) {
    return null;
  }

  return {
    ...status,
    devices: normalizeRelatedDevice(status.devices),
  } as DeviceStatusRow;
}

export async function createDemoPetsAndSchedules(userId: string) {
  const { data: existingPets, error: existingPetError } = await supabase
    .from('pets')
    .select('id, name')
    .in('name', ['Milo', 'Mimi']);

  if (existingPetError) {
    throw existingPetError;
  }

  const existingPetNames = new Set((existingPets ?? []).map((pet) => pet.name));
  const petsToCreate = [
    {
      owner_id: userId,
      name: 'Milo',
      species: 'cat',
      breed: 'Orange tabby',
      daily_gram_limit: 46,
    },
    {
      owner_id: userId,
      name: 'Mimi',
      species: 'cat',
      breed: 'Tuxedo',
      daily_gram_limit: 38,
    },
  ].filter((pet) => !existingPetNames.has(pet.name));

  if (petsToCreate.length > 0) {
    const { error: createPetError } = await supabase.from('pets').insert(petsToCreate);

    if (createPetError) {
      throw createPetError;
    }
  }

  const { data: pets, error: petError } = await supabase
    .from('pets')
    .select('id, name')
    .in('name', ['Milo', 'Mimi']);

  if (petError) {
    throw petError;
  }

  const milo = pets?.find((pet) => pet.name === 'Milo');
  const mimi = pets?.find((pet) => pet.name === 'Mimi');

  const scheduleRows: DemoScheduleRow[] = [
    milo && {
      owner_id: userId,
      pet_id: milo.id,
      meal_name: 'Breakfast',
      scheduled_time: '08:00',
      portion_grams: 22,
    },
    mimi && {
      owner_id: userId,
      pet_id: mimi.id,
      meal_name: 'Breakfast',
      scheduled_time: '08:00',
      portion_grams: 18,
    },
    milo && {
      owner_id: userId,
      pet_id: milo.id,
      meal_name: 'Dinner',
      scheduled_time: '18:30',
      portion_grams: 24,
    },
    mimi && {
      owner_id: userId,
      pet_id: mimi.id,
      meal_name: 'Dinner',
      scheduled_time: '18:30',
      portion_grams: 20,
    },
  ].filter((schedule): schedule is DemoScheduleRow => Boolean(schedule));

  const { data: existingSchedules, error: existingScheduleError } = await supabase
    .from('feeding_schedules')
    .select('pet_id, meal_name, scheduled_time')
    .in(
      'pet_id',
      scheduleRows.map((schedule) => schedule.pet_id),
    );

  if (existingScheduleError) {
    throw existingScheduleError;
  }

  const existingScheduleKeys = new Set(
    (existingSchedules ?? []).map(
      (schedule) => `${schedule.pet_id}:${schedule.meal_name}:${normalizeScheduleTime(schedule.scheduled_time)}`,
    ),
  );
  const schedulesToCreate = scheduleRows.filter(
    (schedule) =>
      !existingScheduleKeys.has(
        `${schedule.pet_id}:${schedule.meal_name}:${normalizeScheduleTime(schedule.scheduled_time)}`,
      ),
  );

  if (schedulesToCreate.length === 0) {
    return;
  }

  const { error: scheduleError } = await supabase
    .from('feeding_schedules')
    .insert(schedulesToCreate);

  if (scheduleError) {
    throw scheduleError;
  }
}

function normalizeScheduleTime(value: string) {
  return value.slice(0, 5);
}

async function attachPetAvatarUrls(pets: PetWithImages[]) {
  return Promise.all(
    pets.map(async (pet) => {
      const profileImage = getLatestProfileImage(pet.pet_images ?? []);
      const { pet_images, ...petWithoutImages } = pet;

      return {
        ...petWithoutImages,
        avatar_url: profileImage ? await createPetImageSignedUrl(profileImage.storage_path) : null,
      };
    }),
  );
}

function getLatestProfileImage(images: PetImageRow[]) {
  return images
    .filter((image) => image.image_role === 'profile')
    .sort((first, second) => second.created_at.localeCompare(first.created_at))[0];
}

async function createPetImageSignedUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from('pet-images')
    .createSignedUrl(storagePath, 60 * 60);

  if (error) {
    throw error;
  }

  return data.signedUrl;
}

async function fetchPetProfileImagePaths(ownerId: string, petId: string) {
  const { data, error } = await supabase
    .from('pet_images')
    .select('storage_path')
    .eq('owner_id', ownerId)
    .eq('pet_id', petId)
    .eq('image_role', 'profile');

  if (error) {
    throw error;
  }

  return (data ?? []).map((image) => image.storage_path);
}

async function deleteOldPetProfileImages(storagePaths: string[]) {
  if (storagePaths.length === 0) {
    return;
  }

  const { error: storageError } = await supabase.storage
    .from('pet-images')
    .remove(storagePaths);

  if (storageError) {
    console.warn('Could not delete old pet profile image files.', storageError);
  }

  const { error: imageError } = await supabase
    .from('pet_images')
    .delete()
    .in('storage_path', storagePaths);

  if (imageError) {
    console.warn('Could not delete old pet profile image rows.', imageError);
  }
}

function getImageExtension(uri: string) {
  const extension = uri.split('?')[0]?.split('.').pop()?.toLowerCase();

  if (extension === 'png' || extension === 'webp') {
    return extension;
  }

  return 'jpg';
}

function getImageContentType(extension: string) {
  if (extension === 'png') {
    return 'image/png';
  }

  if (extension === 'webp') {
    return 'image/webp';
  }

  return 'image/jpeg';
}

export async function logManualFeedingEvent(userId: string, pet: PetRow) {
  const { error } = await supabase.from('feeding_events').insert({
    owner_id: userId,
    pet_id: pet.id,
    event_type: 'manual',
    authorized: true,
    amount_grams: pet.daily_gram_limit,
    recognition_label: pet.name,
    notes: 'Manual demo event from the mobile app',
  });

  if (error) {
    throw error;
  }
}
