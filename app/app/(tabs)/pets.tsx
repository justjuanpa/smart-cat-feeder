import { Image } from "expo-image";
import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { usePawsRealtime } from "@/hooks/use-paws-realtime";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import {
  ensureProfile,
  fetchPets,
  fetchSchedules,
  fetchTodayScheduleRuns,
  type FeedingScheduleRow,
  type PetRow,
  type ScheduleRunRow,
} from "@/utils/paws-data";
import { formatGrams, formatScheduleTime } from "@/utils/formatters";

const petColors = ["#1D4FA3", "#5F7FBD", "#6B8FD6", "#8CA8E8"];
type ScheduleSort = "time" | "newest";

export default function PetsScreen() {
  const { session } = useSupabaseSession();
  const [pets, setPets] = useState<PetRow[]>([]);
  const [schedules, setSchedules] = useState<FeedingScheduleRow[]>([]);
  const [scheduleRuns, setScheduleRuns] = useState<ScheduleRunRow[]>([]);
  const [failedAvatarIds, setFailedAvatarIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduleSort, setScheduleSort] = useState<ScheduleSort>("time");

  const sortedSchedules = useMemo(() => {
    return [...schedules].sort((first, second) => {
      if (scheduleSort === "newest") {
        return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
      }

      return first.scheduled_time.localeCompare(second.scheduled_time);
    });
  }, [scheduleSort, schedules]);

  const loadPetData = useCallback(async () => {
    const ownerId = session?.user.id;
    if (!ownerId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [nextPets, nextSchedules, nextScheduleRuns] = await Promise.all([
        fetchPets(ownerId),
        fetchSchedules(ownerId),
        fetchTodayScheduleRuns(ownerId),
      ]);
      setPets(nextPets);
      setSchedules(nextSchedules);
      setScheduleRuns(nextScheduleRuns);
      setFailedAvatarIds(new Set());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load pets.",
      );
    } finally {
      setLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    ensureProfile(session.user.id, session.user.email)
      .then(loadPetData)
      .catch((profileError: Error) => setError(profileError.message));
  }, [loadPetData, session?.user]);

  usePawsRealtime({
    userId: session?.user.id,
    onPetChange: loadPetData,
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Profiles & Meals</Text>
            <Text style={styles.title}>Pets</Text>
          </View>
          <Pressable onPress={loadPetData} style={styles.iconButton}>
            <MaterialIcons name="refresh" size={22} color="#1D4FA3" />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.cardTitle}>Backend error</Text>
            <Text style={styles.muted}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderText}>
              <Text style={styles.sectionTitle}>Pet profiles</Text>
              <Text style={styles.muted}>
                Recognition thresholds and daily limits
              </Text>
            </View>
            <Pressable
              onPress={() => router.push("/edit-pet" as never)}
              style={styles.addButton}
            >
              <MaterialIcons name="add" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          {pets.length === 0 ? (
            <Text style={styles.muted}>
              {loading
                ? "Loading pets..."
                : "No pets yet. Press + to create your first pet profile."}
            </Text>
          ) : (
            pets.map((pet, index) => (
              <Pressable
                key={pet.id}
                onPress={() =>
                  router.push({ pathname: "/edit-pet", params: { id: pet.id } })
                }
                style={styles.petRow}
              >
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: petColors[index % petColors.length] },
                  ]}
                >
                  {pet.avatar_url && !failedAvatarIds.has(pet.id) ? (
                    <Image
                      contentFit="cover"
                      onError={() =>
                        setFailedAvatarIds((currentIds) => {
                          const nextIds = new Set(currentIds);
                          nextIds.add(pet.id);
                          return nextIds;
                        })
                      }
                      source={{ uri: pet.avatar_url }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <Text style={styles.initial}>{pet.name[0]}</Text>
                  )}
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.cardTitle}>{pet.name}</Text>
                  <Text style={styles.muted}>{pet.breed ?? pet.species}</Text>
                </View>
                <View style={styles.rowMeta}>
                  <Text style={styles.amount}>
                    {formatGrams(pet.daily_gram_limit)}/day
                  </Text>
                  <Text style={styles.small}>
                    {Math.round(pet.recognition_threshold * 100)}% threshold
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={22} color="#91A0B8" />
              </Pressable>
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderText}>
              <Text style={styles.sectionTitle}>Meal schedule</Text>
              <Text style={styles.muted}>
                Tap a meal to edit time, pet, portion, or pause
              </Text>
            </View>
            <Pressable
              onPress={() => router.push("/edit-schedule" as never)}
              style={styles.addButton}
            >
              <MaterialIcons name="add" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          {schedules.length > 1 ? (
            <View style={styles.sortControls}>
              <SortButton
                active={scheduleSort === "time"}
                label="Meal time"
                onPress={() => setScheduleSort("time")}
              />
              <SortButton
                active={scheduleSort === "newest"}
                label="Newest"
                onPress={() => setScheduleSort("newest")}
              />
            </View>
          ) : null}

          {sortedSchedules.length === 0 ? (
            <Text style={styles.muted}>
              No schedules yet. Press + to add the first meal.
            </Text>
          ) : (
            sortedSchedules.map((meal) => (
              <Pressable
                key={meal.id}
                onPress={() =>
                  router.push({
                    pathname: "/edit-schedule",
                    params: { id: meal.id },
                  } as never)
                }
                style={[styles.scheduleRow, !meal.enabled && styles.pausedScheduleRow]}
              >
                <View style={[styles.timePill, !meal.enabled && styles.pausedTimePill]}>
                  <Text style={[styles.timeText, !meal.enabled && styles.pausedTimeText]}>
                    {formatScheduleTime(meal.scheduled_time)}
                  </Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.cardTitle}>{meal.meal_name}</Text>
                  <Text style={styles.muted}>
                    {meal.pets?.name ?? "Pet"} gets{" "}
                    {formatGrams(meal.portion_grams)}
                  </Text>
                </View>
                <View style={styles.scheduleMeta}>
                  <ScheduleStatusBadge
                    meal={meal}
                    latestRun={latestRunForSchedule(scheduleRuns, meal.id)}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      meal.enabled ? styles.enabledText : styles.pausedText,
                    ]}
                  >
                    {meal.enabled ? "Active" : "Paused"}
                  </Text>
                  <MaterialIcons
                    name="chevron-right"
                    size={22}
                    color="#91A0B8"
                  />
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SortButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.sortButton, active && styles.sortButtonActive]}
    >
      <Text style={[styles.sortButtonText, active && styles.sortButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function latestRunForSchedule(runs: ScheduleRunRow[], scheduleId: string) {
  return runs.find((run) => run.schedule_id === scheduleId) ?? null;
}

function ScheduleStatusBadge({
  meal,
  latestRun,
}: {
  meal: FeedingScheduleRow;
  latestRun: ScheduleRunRow | null;
}) {
  const status = scheduleStatus(meal, latestRun);

  return (
    <View style={[styles.scheduleBadge, { backgroundColor: status.backgroundColor }]}>
      <Text style={[styles.scheduleBadgeText, { color: status.color }]}>{status.label}</Text>
    </View>
  );
}

function scheduleStatus(meal: FeedingScheduleRow, latestRun: ScheduleRunRow | null) {
  if (!meal.enabled) {
    return {
      label: "Paused",
      color: "#92400E",
      backgroundColor: "#FEF3C7",
    };
  }

  if (latestRun?.status === "dispensed") {
    return {
      label: "Dispensed today",
      color: "#166534",
      backgroundColor: "#DCFCE7",
    };
  }

  if (latestRun?.status === "skipped") {
    return {
      label: "Skipped today",
      color: "#92400E",
      backgroundColor: "#FEF3C7",
    };
  }

  if (latestRun?.status === "claimed" || latestRun?.status === "command_sent") {
    return {
      label: "Waiting for device",
      color: "#1D4FA3",
      backgroundColor: "#EEF4FF",
    };
  }

  if (latestRun?.status === "failed") {
    return {
      label: "Needs attention",
      color: "#991B1B",
      backgroundColor: "#FEE2E2",
    };
  }

  const scheduledDate = scheduleDateForToday(meal.scheduled_time);
  if (scheduledDate.getTime() > Date.now()) {
    return {
      label: "Upcoming",
      color: "#1D4FA3",
      backgroundColor: "#EEF4FF",
    };
  }

  return {
    label: "Waiting for device",
    color: "#64748B",
    backgroundColor: "#F1F5F9",
  };
}

function scheduleDateForToday(value: string) {
  const [hours, minutes] = value.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return date;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7FAFF",
  },
  container: {
    gap: 18,
    padding: 20,
    paddingBottom: 36,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
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
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#D8E2F3",
    borderWidth: 1,
    borderRadius: 8,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D8E2F3",
    borderWidth: 1,
    borderRadius: 8,
    gap: 14,
    padding: 16,
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  cardHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  addButton: {
    alignItems: "center",
    backgroundColor: "#1D4FA3",
    borderRadius: 8,
    flexShrink: 0,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  disabledButton: {
    opacity: 0.7,
  },
  sectionTitle: {
    color: "#10213F",
    fontSize: 21,
    fontWeight: "900",
  },
  petRow: {
    alignItems: "center",
    borderTopColor: "#E6EDF8",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingTop: 14,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 8,
    height: 44,
    justifyContent: "center",
    overflow: "hidden",
    width: 44,
  },
  avatarImage: {
    height: "100%",
    width: "100%",
  },
  initial: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },
  rowText: {
    flex: 1,
  },
  rowMeta: {
    alignItems: "flex-end",
    gap: 2,
  },
  scheduleMeta: {
    alignItems: "flex-end",
    gap: 6,
  },
  sortControls: {
    backgroundColor: "#EEF4FF",
    borderRadius: 8,
    flexDirection: "row",
    gap: 6,
    padding: 4,
  },
  sortButton: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  sortButtonActive: {
    backgroundColor: "#FFFFFF",
  },
  sortButtonText: {
    color: "#5F6F8C",
    fontSize: 13,
    fontWeight: "900",
  },
  sortButtonTextActive: {
    color: "#1D4FA3",
  },
  scheduleRow: {
    alignItems: "center",
    borderTopColor: "#E6EDF8",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingTop: 14,
  },
  pausedScheduleRow: {
    opacity: 0.72,
  },
  timePill: {
    backgroundColor: "#EEF4FF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pausedTimePill: {
    backgroundColor: "#F1F5F9",
  },
  timeText: {
    color: "#1D4FA3",
    fontSize: 13,
    fontWeight: "900",
  },
  pausedTimeText: {
    color: "#64748B",
  },
  errorCard: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FCA5A5",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  cardTitle: {
    color: "#10213F",
    fontSize: 16,
    fontWeight: "900",
  },
  muted: {
    color: "#667085",
    fontSize: 14,
    lineHeight: 20,
  },
  amount: {
    color: "#10213F",
    fontSize: 14,
    fontWeight: "900",
  },
  small: {
    color: "#7A8BA6",
    fontSize: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "900",
  },
  scheduleBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  scheduleBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },
  enabledText: {
    color: "#166534",
  },
  pausedText: {
    color: "#92400E",
  },
});
