import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.1';

type EnrollmentRequest = {
  serial_number?: string;
};

type PetImage = {
  storage_path: string;
  image_role: string;
  created_at: string;
};

type PetWithImages = {
  id: string;
  name: string;
  active: boolean;
  bowl_side: 'LEFT' | 'RIGHT';
  recognition_threshold: number;
  margin_threshold: number;
  pet_images?: PetImage[] | null;
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

  let payload: EnrollmentRequest;

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

  const { data: pets, error: petError } = await supabase
    .from('pets')
    .select('id, name, active, bowl_side, recognition_threshold, margin_threshold, pet_images(storage_path, image_role, created_at)')
    .eq('owner_id', device.owner_id)
    .eq('active', true)
    .order('created_at', { ascending: true });

  if (petError) {
    return jsonResponse({ error: petError.message }, 500);
  }

  const enrolledPets = await Promise.all(
    ((pets ?? []) as PetWithImages[]).map(async (pet) => {
      const trainingImages = (pet.pet_images ?? [])
        .filter((image) => image.image_role === 'training')
        .sort((first, second) => first.created_at.localeCompare(second.created_at));

      const images = await Promise.all(
        trainingImages.map(async (image) => {
          const { data, error } = await supabase.storage
            .from('pet-images')
            .createSignedUrl(image.storage_path, 10 * 60);

          if (error) {
            throw error;
          }

          return {
            storage_path: image.storage_path,
            created_at: image.created_at,
            signed_url: data.signedUrl,
          };
        }),
      );

      return {
        id: pet.id,
        name: pet.name,
        bowl_side: pet.bowl_side,
        recognition_threshold: pet.recognition_threshold,
        margin_threshold: pet.margin_threshold,
        image_count: images.length,
        images,
      };
    }),
  );

  return jsonResponse({
    ok: true,
    device_id: device.id,
    pets: enrolledPets,
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
