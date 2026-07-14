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
import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import * as Linking from 'expo-linking';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSupabaseSession } from '@/hooks/use-supabase-session';
import { ensureProfile } from '@/utils/paws-data';
import { supabase } from '@/utils/supabase';

export default function AuthScreen() {
  const { session, loading: sessionLoading } = useSupabaseSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    ensureProfile(
      session.user.id,
      displayName.trim() || session.user.email,
    ).catch((error: Error) => Alert.alert('Profile setup failed', error.message));
  }, [displayName, session?.user]);

  if (!sessionLoading && session) {
    return <Redirect href="/(tabs)" />;
  }

  async function signIn() {
    await submitAuth('sign-in');
  }

  async function signUp() {
    await submitAuth('sign-up');
  }

  async function submitAuth(mode: 'sign-in' | 'sign-up') {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || password.length < 6) {
      Alert.alert('Missing info', 'Enter an email and a password with at least 6 characters.');
      return;
    }

    setSubmitting(true);

    const response =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          })
        : await supabase.auth.signUp({
            email: trimmedEmail,
            password,
            options: {
              emailRedirectTo: Linking.createURL('/auth'),
            },
          });

    setSubmitting(false);

    if (response.error) {
      Alert.alert(mode === 'sign-in' ? 'Sign in failed' : 'Sign up failed', response.error.message);
      return;
    }

    if (response.data.session?.user) {
      await ensureProfile(
        response.data.session.user.id,
        displayName.trim() || response.data.session.user.email,
      );
      router.replace('/(tabs)');
      return;
    }

    Alert.alert('Check your email', 'Confirm your email address, then come back and sign in.');
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
          <View style={styles.logoMark}>
            <MaterialIcons name="pets" size={42} color="#1D4FA3" />
          </View>
          <View>
            <Text style={styles.title}>PAWS</Text>
            <Text style={styles.subtitle}>Personalized Access Weighted System</Text>
            <Text style={styles.copy}>
              Welcome back. Sign in to continue to your smart pet feeder.
            </Text>
          </View>

          <View style={styles.form}>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor="#91A0B8"
              returnKeyType="next"
              style={styles.input}
              value={email}
            />
            <TextInput
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor="#91A0B8"
              returnKeyType="next"
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <TextInput
              onChangeText={setDisplayName}
              placeholder="Display name"
              placeholderTextColor="#91A0B8"
              returnKeyType="done"
              style={styles.input}
              value={displayName}
            />

            <Pressable
              disabled={submitting}
              onPress={signIn}
              style={[styles.primaryButton, submitting && styles.disabledButton]}>
              <Text style={styles.primaryButtonText}>
                {submitting ? 'Working...' : 'Sign in'}
              </Text>
            </Pressable>
            <Pressable disabled={submitting} onPress={signUp} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Create account</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
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
    gap: 24,
    justifyContent: 'center',
    flexGrow: 1,
    padding: 24,
    paddingBottom: 40,
  },
  logoMark: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#BFD0EC',
    borderRadius: 999,
    borderWidth: 2,
    height: 86,
    justifyContent: 'center',
    marginBottom: 4,
    width: 86,
  },
  eyebrow: {
    color: '#1D4FA3',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#1D4FA3',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 46,
    textAlign: 'center',
  },
  subtitle: {
    color: '#10213F',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  copy: {
    color: '#667085',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 22,
  },
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8E2F3',
    borderRadius: 8,
    borderWidth: 1,
    color: '#10213F',
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#1D4FA3',
    borderRadius: 8,
    marginTop: 8,
    padding: 16,
  },
  disabledButton: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
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
});
