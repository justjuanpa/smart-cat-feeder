import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSupabaseSession } from '@/hooks/use-supabase-session';
import { fetchLatestDeviceStatus, type DeviceStatusRow } from '@/utils/paws-data';
import { supabase } from '@/utils/supabase';
import { formatGrams, formatRelativeTime } from '@/utils/formatters';

export default function DeviceScreen() {
  const { session } = useSupabaseSession();
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDevice = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setDeviceStatus(await fetchLatestDeviceStatus());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load device status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadDevice();
    }
  }, [loadDevice, session?.user]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  const online = Boolean(deviceStatus?.online);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Hardware</Text>
            <Text style={styles.title}>Device</Text>
          </View>
          <Pressable onPress={loadDevice} style={styles.iconButton}>
            <MaterialIcons name="refresh" size={22} color="#0F766E" />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <View style={[styles.statusDot, online ? styles.onlineDot : styles.offlineDot]} />
          <Text style={styles.heroLabel}>{deviceStatus?.devices?.name ?? 'PAWS Feeder'}</Text>
          <Text style={styles.heroTitle}>{online ? 'Online' : 'No heartbeat yet'}</Text>
          <Text style={styles.muted}>
            {deviceStatus
              ? `Last updated ${formatRelativeTime(deviceStatus.updated_at)}.`
              : 'Run the Raspberry Pi UART bridge to create the first status row.'}
          </Text>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.cardTitle}>Backend error</Text>
            <Text style={styles.muted}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.metricGrid}>
          <Metric label="Bowl weight" value={formatGrams(deviceStatus?.current_weight_grams ?? null)} />
          <Metric label="Last motion" value={formatRelativeTime(deviceStatus?.last_motion_at ?? null)} />
          <Metric label="Last event" value={formatRelativeTime(deviceStatus?.last_event_at ?? null)} />
          <Metric label="Vision" value={deviceStatus?.vision_version ?? 'Unknown'} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>System readiness</Text>
          <SetupRow done title="Supabase schema" detail="Tables and RLS are live" />
          <SetupRow done title="Mobile app backend" detail="Auth, profiles, events, and status connected" />
          <SetupRow done={online} title="Raspberry Pi bridge" detail={online ? 'Heartbeat received' : 'Waiting for Pi'} />
          <SetupRow done={false} title="Motors and sensors" detail="Add dispensed/consumed events after hardware tests" />
        </View>

        <Pressable onPress={signOut} style={styles.secondaryButton}>
          <MaterialIcons name="logout" size={20} color="#0F766E" />
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        </Pressable>

        {loading ? <Text style={styles.muted}>Refreshing device status...</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function SetupRow({ title, detail, done }: { title: string; detail: string; done: boolean }) {
  return (
    <View style={styles.setupRow}>
      <View style={[styles.statusIcon, done ? styles.doneIcon : styles.pendingIcon]}>
        <MaterialIcons name={done ? 'check' : 'sync'} size={18} color={done ? '#166534' : '#92400E'} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.muted}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F2EA',
  },
  container: {
    gap: 18,
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#172121',
    fontSize: 34,
    fontWeight: '900',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    gap: 10,
    padding: 18,
  },
  statusDot: {
    borderRadius: 7,
    height: 14,
    width: 14,
  },
  onlineDot: {
    backgroundColor: '#16A34A',
  },
  offlineDot: {
    backgroundColor: '#F59E0B',
  },
  heroLabel: {
    color: '#6B6259',
    fontSize: 14,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#172121',
    fontSize: 28,
    fontWeight: '900',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metric: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 4,
    padding: 14,
  },
  metricValue: {
    color: '#172121',
    fontSize: 17,
    fontWeight: '900',
  },
  metricLabel: {
    color: '#7C7066',
    fontSize: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    gap: 14,
    padding: 16,
  },
  sectionTitle: {
    color: '#172121',
    fontSize: 21,
    fontWeight: '900',
  },
  setupRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  statusIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  doneIcon: {
    backgroundColor: '#DCFCE7',
  },
  pendingIcon: {
    backgroundColor: '#FEF3C7',
  },
  rowText: {
    flex: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#0F766E',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    padding: 16,
  },
  secondaryButtonText: {
    color: '#0F766E',
    fontSize: 16,
    fontWeight: '900',
  },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  cardTitle: {
    color: '#172121',
    fontSize: 16,
    fontWeight: '900',
  },
  muted: {
    color: '#6B6259',
    fontSize: 14,
    lineHeight: 20,
  },
});
