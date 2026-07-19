import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';

type FeedingEventType = 'authorized' | 'denied' | 'dispensed' | 'consumed' | 'scheduled_dry_run';

type DevicePayload = {
  serial_number?: string;
  event_type?: FeedingEventType;
  occurred_at?: string;
  authorized?: boolean;
  recognition_label?: string;
  recognition_confidence?: number;
  amount_grams?: number;
  current_weight_grams?: number;
  left_bowl_weight_grams?: number;
  right_bowl_weight_grams?: number;
  motion_detected?: boolean;
  firmware_version?: string;
  vision_version?: string;
  notes?: string;
  raw_payload?: Record<string, unknown>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paws-device-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const eventTypes = new Set<FeedingEventType>([
  'authorized',
  'denied',
  'dispensed',
  'consumed',
  'scheduled_dry_run',
]);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonResponse({}, 200);
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase server configuration.' }, 500);
  }

  const deviceToken = request.headers.get('x-paws-device-token');

  if (!deviceToken) {
    return jsonResponse({ error: 'Missing device token.' }, 401);
  }

  let payload: DevicePayload;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be JSON.' }, 400);
  }

  if (!payload.serial_number) {
    return jsonResponse({ error: 'serial_number is required.' }, 400);
  }

  if (payload.event_type && !eventTypes.has(payload.event_type)) {
    return jsonResponse({ error: 'Unsupported event_type.' }, 400);
  }

  const tokenHash = await sha256Hex(deviceToken);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });

  const { data: device, error: deviceError } = await supabase
    .from('devices')
    .select('id, owner_id, api_key_hash')
    .eq('serial_number', payload.serial_number)
    .maybeSingle();

  if (deviceError) {
    return jsonResponse({ error: deviceError.message }, 500);
  }

  if (!device || device.api_key_hash !== tokenHash) {
    return jsonResponse({ error: 'Invalid device credentials.' }, 401);
  }

  const now = new Date().toISOString();
  const occurredAt = payload.occurred_at ?? now;

  const { error: statusError } = await supabase
    .from('devices')
    .update({
      status: 'online',
      last_seen_at: now,
    })
    .eq('id', device.id);

  if (statusError) {
    return jsonResponse({ error: statusError.message }, 500);
  }

  let deviceStatusRow;

  try {
    deviceStatusRow = await buildDeviceStatusRow(supabase, {
      device_id: device.id,
      owner_id: device.owner_id,
      payload,
      now,
      occurred_at: occurredAt,
    });
  } catch (statusBuildError) {
    const message = statusBuildError instanceof Error ? statusBuildError.message : 'Could not build device status row.';
    return jsonResponse({ error: message }, 500);
  }

  const { error: deviceStatusError } = await supabase
    .from('device_status')
    .upsert(deviceStatusRow);

  if (deviceStatusError) {
    return jsonResponse({ error: deviceStatusError.message }, 500);
  }

  const { data: updatedDeviceStatus } = await supabase
    .from('device_status')
    .select('current_weight_grams, left_bowl_weight_grams, right_bowl_weight_grams, updated_at')
    .eq('device_id', device.id)
    .maybeSingle();

  if (!payload.event_type) {
    return jsonResponse({
      ok: true,
      device_id: device.id,
      status_updated: true,
      feeding_event_created: false,
      device_status: updatedDeviceStatus,
    });
  }

  const petId = await findPetId(supabase, device.owner_id, payload.recognition_label);
  const { data: event, error: eventError } = await supabase
    .from('feeding_events')
    .insert({
      owner_id: device.owner_id,
      device_id: device.id,
      pet_id: petId,
      event_type: payload.event_type,
      occurred_at: occurredAt,
      authorized: payload.authorized ?? null,
      amount_grams: payload.amount_grams ?? null,
      recognition_label: payload.recognition_label ?? null,
      recognition_confidence: payload.recognition_confidence ?? null,
      notes: payload.notes ?? null,
      raw_payload: payload.raw_payload ?? payload,
    })
    .select('id')
    .single();

  if (eventError) {
    return jsonResponse({ error: eventError.message }, 500);
  }

  if (payload.event_type === 'dispensed') {
    const scheduleRunId = scheduledRunIdFromPayload(payload.raw_payload);

    if (scheduleRunId) {
      const { error: runUpdateError } = await supabase
        .from('schedule_runs')
        .update({
          status: 'dispensed',
          notes: payload.notes ?? null,
          raw_payload: payload.raw_payload ?? payload,
        })
        .eq('id', scheduleRunId)
        .eq('owner_id', device.owner_id);

      if (runUpdateError) {
        return jsonResponse({ error: runUpdateError.message }, 500);
      }
    }
  }

  return jsonResponse({
    ok: true,
    device_id: device.id,
    feeding_event_id: event.id,
    feeding_event_created: true,
    device_status: updatedDeviceStatus,
  });
});

async function buildDeviceStatusRow(
  supabase: ReturnType<typeof createClient>,
  {
    device_id,
    owner_id,
    payload,
    now,
    occurred_at,
  }: {
    device_id: string;
    owner_id: string;
    payload: DevicePayload;
    now: string;
    occurred_at: string;
  },
) {
  const { data: existingStatus, error } = await supabase
    .from('device_status')
    .select('current_weight_grams, left_bowl_weight_grams, right_bowl_weight_grams, last_motion_at, last_event_at, firmware_version, vision_version')
    .eq('device_id', device_id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    device_id,
    owner_id,
    online: true,
    current_weight_grams: payload.current_weight_grams ?? existingStatus?.current_weight_grams ?? null,
    left_bowl_weight_grams: payload.left_bowl_weight_grams ?? existingStatus?.left_bowl_weight_grams ?? null,
    right_bowl_weight_grams: payload.right_bowl_weight_grams ?? existingStatus?.right_bowl_weight_grams ?? null,
    last_motion_at: payload.motion_detected ? now : existingStatus?.last_motion_at ?? null,
    last_event_at: payload.event_type ? occurred_at : existingStatus?.last_event_at ?? null,
    firmware_version: payload.firmware_version ?? existingStatus?.firmware_version ?? null,
    vision_version: payload.vision_version ?? existingStatus?.vision_version ?? null,
    updated_at: now,
  };
}

async function findPetId(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  recognitionLabel?: string,
) {
  if (!recognitionLabel) {
    return null;
  }

  const { data, error } = await supabase
    .from('pets')
    .select('id')
    .eq('owner_id', ownerId)
    .ilike('name', recognitionLabel)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

function scheduledRunIdFromPayload(rawPayload?: Record<string, unknown>) {
  const scheduledContext = rawPayload?.scheduled_context;

  if (!scheduledContext || typeof scheduledContext !== 'object') {
    return null;
  }

  const scheduleRunId = (scheduledContext as Record<string, unknown>).schedule_run_id;
  return typeof scheduleRunId === 'string' ? scheduleRunId : null;
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
