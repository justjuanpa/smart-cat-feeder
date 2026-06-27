import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;
const canUsePersistentStorage =
  typeof window !== 'undefined' || globalThis.navigator?.product === 'ReactNative';

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: {
      getItem: (key) => (canUsePersistentStorage ? AsyncStorage.getItem(key) : Promise.resolve(null)),
      setItem: (key, value) =>
        canUsePersistentStorage ? AsyncStorage.setItem(key, value) : Promise.resolve(),
      removeItem: (key) =>
        canUsePersistentStorage ? AsyncStorage.removeItem(key) : Promise.resolve(),
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
