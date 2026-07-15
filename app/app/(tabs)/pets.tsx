import { Image } from "expo-image";
import { MaterialIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
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
  createDemoPetsAndSchedules,
  ensureProfile,
  fetchPets,
  fetchSchedules,
  type FeedingScheduleRow,
  type PetRow,
} from "@/utils/paws-data";
import { formatGrams, formatScheduleTime } from "@/utils/formatters";

const petColors = ["#1D4FA3", "#5F7FBD", "#6B8FD6", "#8CA8E8"];

export default function PetsScreen() {
  const { session } = useSupabaseSession();
  const [pets, setPets] = useState<PetRow[]>([]);
  const [schedules, setSchedules] = useState<FeedingScheduleRow[]>([]);
  const [failedAvatarIds, setFailedAvatarIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [savingDemo, setSavingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPetData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextPets, nextSchedules] = await Promise.all([
        fetchPets(),
        fetchSchedules(),
      ]);
      setPets(nextPets);
      setSchedules(nextSchedules);
      setFailedAvatarIds(new Set());
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load pets.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

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

  async function createDemoData() {
    if (!session?.user) {
      return;
    }

    setSavingDemo(true);

    try {
      await createDemoPetsAndSchedules(session.user.id);
      await loadPetData();
    } catch (demoError) {
      Alert.alert(
        "Could not create demo data",
        demoError instanceof Error
          ? demoError.message
          : "Try again in a moment.",
      );
    } finally {
      setSavingDemo(false);
    }
  }

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
              disabled={savingDemo}
              onPress={createDemoData}
              style={[styles.addButton, savingDemo && styles.disabledButton]}
            >
              <MaterialIcons name="add" size={22} color="#FFFFFF" />
            </Pressable>
          </View>

          {pets.length === 0 ? (
            <Text style={styles.muted}>
              {loading
                ? "Loading pets..."
                : "No pets yet. Press + to create Milo and Mimi."}
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
          {schedules.length === 0 ? (
            <Text style={styles.muted}>
              No schedules yet. Press + to add the first meal.
            </Text>
          ) : (
            schedules.map((meal) => (
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
    flexDirection: "row",
    gap: 4,
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
  enabledText: {
    color: "#166534",
  },
  pausedText: {
    color: "#92400E",
  },
});
