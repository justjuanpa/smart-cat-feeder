import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';

type ScheduleRequest = {
  serial_number?: string;
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

  let payload: ScheduleRequest;

  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Request body must be JSON.' }, 400);
  }

  if (!payload.serial_number) {
    return jsonResponse({ error: 'serial_number is required.' }, 400);
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

  const { data: schedules, error: scheduleError } = await supabase
    .from('feeding_schedules')
    .select('id, pet_id, meal_name, scheduled_time, portion_grams, enabled, pets(name, active, bowl_side)')
    .eq('owner_id', device.owner_id)
    .eq('enabled', true)
    .order('scheduled_time', { ascending: true });

  if (scheduleError) {
    return jsonResponse({ error: scheduleError.message }, 500);
  }

  return jsonResponse({
    ok: true,
    device_id: device.id,
    schedules: (schedules ?? []).filter((schedule) => schedule.pets?.active !== false),
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
