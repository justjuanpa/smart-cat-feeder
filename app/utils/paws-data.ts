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
    .select('id, name, species, breed, daily_gram_limit, recognition_threshold, margin_threshold, active')
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as PetRow[];
}

export async function fetchSchedules() {
  const { data, error } = await supabase
    .from('feeding_schedules')
    .select('id, pet_id, meal_name, scheduled_time, portion_grams, enabled, pets(name)')
    .eq('enabled', true)
    .order('scheduled_time', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((schedule) => ({
    ...schedule,
    pets: normalizeRelatedPet(schedule.pets),
  })) as FeedingScheduleRow[];
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
      'device_id, owner_id, online, current_weight_grams, last_motion_at, last_event_at, firmware_version, vision_version, updated_at, devices(name, status, last_seen_at)',
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
      (schedule) => `${schedule.pet_id}:${schedule.meal_name}:${schedule.scheduled_time}`,
    ),
  );
  const schedulesToCreate = scheduleRows.filter(
    (schedule) =>
      !existingScheduleKeys.has(`${schedule.pet_id}:${schedule.meal_name}:${schedule.scheduled_time}`),
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
