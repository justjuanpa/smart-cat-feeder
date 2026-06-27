import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSupabaseSession } from '@/hooks/use-supabase-session';
import {
  createDemoPetsAndSchedules,
  ensureProfile,
  fetchPets,
  fetchSchedules,
  type FeedingScheduleRow,
  type PetRow,
} from '@/utils/paws-data';
import { supabase } from '@/utils/supabase';

export default function ManageScreen() {
  const { session } = useSupabaseSession();
  const [pets, setPets] = useState<PetRow[]>([]);
  const [schedules, setSchedules] = useState<FeedingScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDemo, setSavingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadManageData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextPets, nextSchedules] = await Promise.all([fetchPets(), fetchSchedules()]);
      setPets(nextPets);
      setSchedules(nextSchedules);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load feeder settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    ensureProfile(session.user.id, session.user.email)
      .then(loadManageData)
      .catch((profileError: Error) => setError(profileError.message));
  }, [loadManageData, session?.user]);

  async function createDemoData() {
    if (!session?.user) {
      return;
    }

    setSavingDemo(true);

    try {
      await createDemoPetsAndSchedules(session.user.id);
      await loadManageData();
    } catch (demoError) {
      Alert.alert(
        'Could not create demo data',
        demoError instanceof Error ? demoError.message : 'Try again in a moment.',
      );
    } finally {
      setSavingDemo(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <TextMuted>Controls</TextMuted>
            <TextTitle>Manage feeder</TextTitle>
          </View>
          <Pressable onPress={signOut} style={styles.iconButton}>
            <MaterialIcons name="logout" size={24} color="#172121" />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorPanel}>
            <TextCardTitle>Backend error</TextCardTitle>
            <TextMuted>{error}</TextMuted>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <TextSection>Pet profiles</TextSection>
              <TextMuted>Recognition thresholds and portion rules</TextMuted>
            </View>
            <Pressable
              disabled={savingDemo}
              onPress={createDemoData}
              style={[styles.addButton, savingDemo && styles.disabledButton]}>
              <MaterialIcons name="add" size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          {pets.length === 0 ? (
            <TextMuted>
              {loading
                ? 'Loading pets...'
                : 'No pets yet. Press + to create Milo, Mimi, and their schedules in Supabase.'}
            </TextMuted>
          ) : (
            pets.map((pet) => (
              <ProfileRow
                key={pet.id}
                confidence={`${Math.round(pet.recognition_threshold * 100)}%`}
                meal={`${formatGrams(pet.daily_gram_limit)}/day`}
                name={pet.name}
                tag={pet.breed ?? pet.species}
              />
            ))
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <TextSection>Meal schedule</TextSection>
              <TextMuted>Automatic dispensing windows</TextMuted>
            </View>
            <Pressable onPress={loadManageData} style={styles.textButton}>
              <TextButton>{loading ? 'Loading' : 'Refresh'}</TextButton>
            </Pressable>
          </View>

          {schedules.length === 0 ? (
            <TextMuted>No schedules yet. Create demo data to store real schedule rows.</TextMuted>
          ) : (
            schedules.map((meal) => (
              <View key={meal.id} style={styles.scheduleRow}>
                <View style={styles.timePill}>
                  <TextTime>{formatScheduleTime(meal.scheduled_time)}</TextTime>
                </View>
                <View style={styles.rowText}>
                  <TextCardTitle>{meal.meal_name}</TextCardTitle>
                  <TextMuted>
                    {meal.pets?.name ?? 'Pet'} {formatGrams(meal.portion_grams)}
                  </TextMuted>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <TextSection>System readiness</TextSection>
          <TextMuted style={styles.readinessCopy}>
            The backend and mobile app are connected now. Raspberry Pi ingestion is the next piece.
          </TextMuted>

          <SetupRow done title="Supabase schema" detail="Tables and RLS are live" />
          <SetupRow done title="Mobile app backend" detail="Auth, pets, schedules, and manual logs connected" />
          <SetupRow done={false} title="Raspberry Pi ingestion" detail="Edge Function/device token not built yet" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileRow({
  name,
  tag,
  meal,
  confidence,
}: {
  name: string;
  tag: string;
  meal: string;
  confidence: string;
}) {
  return (
    <View style={styles.profileRow}>
      <View style={styles.avatar}>
        <TextInitial>{name[0]}</TextInitial>
      </View>
      <View style={styles.rowText}>
        <TextCardTitle>{name}</TextCardTitle>
        <TextMuted>{tag}</TextMuted>
      </View>
      <View style={styles.profileMeta}>
        <TextAmount>{meal}</TextAmount>
        <TextSmall>{confidence} threshold</TextSmall>
      </View>
    </View>
  );
}

function SetupRow({ title, detail, done }: { title: string; detail: string; done: boolean }) {
  return (
    <View style={styles.setupRow}>
      <View style={[styles.statusIcon, done ? styles.doneIcon : styles.pendingIcon]}>
        <MaterialIcons
          name={done ? 'check' : 'sync'}
          size={18}
          color={done ? '#166534' : '#92400E'}
        />
      </View>
      <View style={styles.rowText}>
        <TextCardTitle>{title}</TextCardTitle>
        <TextMuted>{detail}</TextMuted>
      </View>
    </View>
  );
}

function formatGrams(value: number) {
  return `${Number(value).toFixed(0)} g`;
}

function formatScheduleTime(value: string) {
  const [hours, minutes] = value.split(':');
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function TextTitle(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.title} />;
}

function TextSection(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.sectionTitle} />;
}

function TextCardTitle(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.cardTitle} />;
}

function TextMuted({ style, ...props }: PropsWithChildren<{ style?: object }>) {
  return <TextBase {...props} style={[styles.muted, style]} />;
}

function TextButton(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.buttonText} />;
}

function TextInitial(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.initial} />;
}

function TextAmount(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.amount} />;
}

function TextSmall(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.small} />;
}

function TextTime(props: PropsWithChildren) {
  return <TextBase {...props} style={styles.timeText} />;
}

function TextBase({ children, style }: PropsWithChildren<{ style?: object | object[] }>) {
  return <Text style={style}>{children}</Text>;
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
  title: {
    color: '#172121',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    gap: 14,
    padding: 16,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#172121',
    fontSize: 21,
    fontWeight: '800',
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: '#0F766E',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  disabledButton: {
    opacity: 0.7,
  },
  textButton: {
    padding: 6,
  },
  buttonText: {
    color: '#0F766E',
    fontSize: 15,
    fontWeight: '800',
  },
  profileRow: {
    alignItems: 'center',
    borderTopColor: '#EFE7DC',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 14,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#155E75',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  initial: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  rowText: {
    flex: 1,
  },
  profileMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  scheduleRow: {
    alignItems: 'center',
    borderTopColor: '#EFE7DC',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingTop: 14,
  },
  timePill: {
    backgroundColor: '#E6F4EF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  timeText: {
    color: '#0F766E',
    fontSize: 13,
    fontWeight: '900',
  },
  readinessCopy: {
    marginTop: -8,
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
  errorPanel: {
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
    fontWeight: '800',
  },
  muted: {
    color: '#6B6259',
    fontSize: 14,
    lineHeight: 20,
  },
  amount: {
    color: '#172121',
    fontSize: 14,
    fontWeight: '900',
  },
  small: {
    color: '#7C7066',
    fontSize: 12,
    lineHeight: 16,
  },
});
