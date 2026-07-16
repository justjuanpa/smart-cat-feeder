import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { usePawsRealtime } from "@/hooks/use-paws-realtime";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import {
  fetchFeedingEvents,
  fetchLatestDeviceStatus,
  fetchPets,
  type DeviceStatusRow,
  type FeedingEventRow,
  type PetRow,
} from "@/utils/paws-data";
import {
  formatGrams,
  formatRelativeTime,
  formatTime,
} from "@/utils/formatters";

export default function DashboardScreen() {
  const { session, loading: sessionLoading } = useSupabaseSession();
  const [pets, setPets] = useState<PetRow[]>([]);
  const [events, setEvents] = useState<FeedingEventRow[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusRow | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextPets, nextEvents, nextDeviceStatus] = await Promise.all([
        fetchPets(),
        fetchFeedingEvents(),
        fetchLatestDeviceStatus(),
      ]);
      setPets(nextPets);
      setEvents(nextEvents);
      setDeviceStatus(nextDeviceStatus);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) {
      return;
    }

    if (!session?.user) {
      setLoading(false);
      return;
    }

    loadDashboard();
  }, [loadDashboard, session?.user, sessionLoading]);

  usePawsRealtime({
    userId: session?.user.id,
    onActivityChange: loadDashboard,
    onDeviceStatusChange: loadDashboard,
  });

  const latestEvent = events[0];
  const title =
    pets.length > 0 ? pets.map((pet) => pet.name).join(" & ") : "PAWS Feeder";
  const deviceOnline = Boolean(deviceStatus?.online);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Smart Feeder</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          <Pressable onPress={loadDashboard} style={styles.refreshButton}>
            <MaterialIcons name="refresh" size={22} color="#1D4FA3" />
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <View
            style={[
              styles.statusDot,
              deviceOnline ? styles.statusOnline : styles.statusOffline,
            ]}
          />
          <Text style={styles.heroLabel}>Feeder status</Text>
          <Text style={styles.heroTitle}>
            {deviceOnline ? "Online and reporting" : "Waiting for feeder"}
          </Text>
          <Text style={styles.bodyText}>
            {deviceStatus
              ? `Last update ${formatRelativeTime(deviceStatus.updated_at)} from ${
                  deviceStatus.devices?.name ?? "PAWS Feeder"
                }.`
              : "Start the Raspberry Pi bridge to send the first heartbeat."}
          </Text>
          <View style={styles.metrics}>
            <Metric label="Pets" value={String(pets.length)} />
            <Metric label="Events" value={String(events.length)} />
            <Metric label="Bowls" value={formatBowlWeights(deviceStatus)} />
          </View>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.cardTitle}>Backend error</Text>
            <Text style={styles.muted}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Quick look</Text>
        <View style={styles.quickGrid}>
          <QuickCard
            href="/(tabs)/activity"
            icon="restaurant"
            title="Activity"
            detail={latestEventSummary(latestEvent)}
          />
          <QuickCard
            href="/(tabs)/pets"
            icon="pets"
            title="Pets"
            detail={`${pets.length} active profiles`}
          />
          <QuickCard
            href="/(tabs)/device"
            icon="memory"
            title="Device"
            detail={deviceOnline ? "Heartbeat received" : "No recent heartbeat"}
          />
        </View>

        {loading ? (
          <Text style={styles.muted}>Refreshing dashboard...</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function latestEventSummary(event?: FeedingEventRow) {
  if (!event) {
    return "No feeding events yet";
  }

  const pet = event.pets?.name ?? event.recognition_label ?? "Unknown pet";
  return `${pet} at ${formatTime(event.occurred_at)}`;
}

function formatBowlWeights(deviceStatus: DeviceStatusRow | null) {
  if (!deviceStatus) {
    return "--";
  }

  const left = formatBowlGrams(deviceStatus.left_bowl_weight_grams);
  const right = formatBowlGrams(deviceStatus.right_bowl_weight_grams);

  return `L: ${left} \nR: ${right}`;
}

function formatBowlGrams(value: number | null) {
  return value == null ? "--" : formatGrams(value);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function QuickCard({
  href,
  icon,
  title,
  detail,
}: {
  href: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  detail: string;
}) {
  return (
    <Pressable
      onPress={() => router.push(href as never)}
      style={styles.quickCard}
    >
      <MaterialIcons name={icon} size={24} color="#1D4FA3" />
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.muted}>{detail}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7FAFF",
  },
  container: {
    gap: 20,
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between",
  },
  eyebrow: {
    color: "#1D4FA3",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  title: {
    color: "#10213F",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0,
  },
  refreshButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#D8E2F3",
    borderWidth: 1,
    borderRadius: 8,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8E2F3",
    borderWidth: 1,
    borderRadius: 8,
    gap: 10,
    padding: 18,
    shadowColor: "#1D4FA3",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 2,
  },
  statusDot: {
    borderRadius: 7,
    height: 14,
    width: 14,
  },
  statusOnline: {
    backgroundColor: "#16A34A",
  },
  statusOffline: {
    backgroundColor: "#F59E0B",
  },
  heroLabel: {
    color: "#667085",
    fontSize: 14,
    fontWeight: "700",
  },
  heroTitle: {
    color: "#10213F",
    fontSize: 26,
    fontWeight: "900",
  },
  bodyText: {
    color: "#4B5563",
    fontSize: 15,
    lineHeight: 22,
  },
  metrics: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  metric: {
    backgroundColor: "#EEF4FF",
    borderRadius: 8,
    flex: 1,
    padding: 12,
  },
  metricValue: {
    color: "#10213F",
    fontSize: 18,
    fontWeight: "900",
  },
  metricLabel: {
    color: "#7A8BA6",
    fontSize: 12,
  },
  sectionTitle: {
    color: "#10213F",
    fontSize: 21,
    fontWeight: "900",
  },
  quickGrid: {
    gap: 12,
  },
  quickCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8E2F3",
    borderWidth: 1,
    borderRadius: 8,
    gap: 6,
    padding: 16,
  },
  cardTitle: {
    color: "#10213F",
    fontSize: 17,
    fontWeight: "900",
  },
  muted: {
    color: "#667085",
    fontSize: 14,
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
});
