import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';

type ClaimRequest = {
  serial_number?: string;
  schedule_id?: string;
  scheduled_for?: string;
  status?: 'claimed' | 'skipped' | 'command_sent' | 'dispensed' | 'failed';
  target_grams?: number;
  starting_bowl_weight_grams?: number | null;
  grams_needed?: number | null;
  side?: 'LEFT' | 'RIGHT' | null;
  notes?: string | null;
  raw_payload?: Record<string, unknown>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paws-device-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

  let payload: ClaimRequest;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be JSON.' }, 400);
  }

  if (!payload.serial_number || !payload.schedule_id || !payload.scheduled_for) {
    return jsonResponse({ error: 'serial_number, schedule_id, and scheduled_for are required.' }, 400);
  }

  if (payload.target_grams == null) {
    return jsonResponse({ error: 'target_grams is required.' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
  const tokenHash = await sha256Hex(deviceToken);

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

  const { data: schedule, error: scheduleError } = await supabase
    .from('feeding_schedules')
    .select('id, owner_id, pet_id')
    .eq('id', payload.schedule_id)
    .eq('owner_id', device.owner_id)
    .maybeSingle();

  if (scheduleError) {
    return jsonResponse({ error: scheduleError.message }, 500);
  }

  if (!schedule) {
    return jsonResponse({ error: 'Schedule not found for this device owner.' }, 404);
  }

  const runRow = {
    owner_id: device.owner_id,
    device_id: device.id,
    schedule_id: schedule.id,
    pet_id: schedule.pet_id,
    scheduled_for: payload.scheduled_for,
    status: payload.status ?? 'claimed',
    target_grams: payload.target_grams,
    starting_bowl_weight_grams: payload.starting_bowl_weight_grams ?? null,
    grams_needed: payload.grams_needed ?? null,
    side: payload.side ?? null,
    notes: payload.notes ?? null,
    raw_payload: payload.raw_payload ?? {},
  };

  const { data: run, error: insertError } = await supabase
    .from('schedule_runs')
    .insert(runRow)
    .select('id, status, scheduled_for')
    .single();

  if (!insertError) {
    return jsonResponse({ ok: true, claimed: true, schedule_run: run });
  }

  if (insertError.code !== '23505') {
    return jsonResponse({ error: insertError.message }, 500);
  }

  const { data: existingRun, error: existingError } = await supabase
    .from('schedule_runs')
    .select('id, status, scheduled_for')
    .eq('schedule_id', schedule.id)
    .eq('scheduled_for', payload.scheduled_for)
    .maybeSingle();

  if (existingError) {
    return jsonResponse({ error: existingError.message }, 500);
  }

  return jsonResponse({
    ok: true,
    claimed: false,
    reason: 'already_claimed',
    schedule_run: existingRun,
  });
});

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
