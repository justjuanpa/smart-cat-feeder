import { useEffect, useRef } from 'react';

import { supabase } from '@/utils/supabase';

type PawsRealtimeOptions = {
  userId?: string;
  onActivityChange?: () => void;
  onDeviceStatusChange?: () => void;
  onPetChange?: () => void;
};

export function usePawsRealtime({
  userId,
  onActivityChange,
  onDeviceStatusChange,
  onPetChange,
}: PawsRealtimeOptions) {
  const channelIdRef = useRef(`paws-realtime:${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!userId || (!onActivityChange && !onDeviceStatusChange && !onPetChange)) {
      return;
    }

    const channel = supabase.channel(`${channelIdRef.current}:${userId}`);

    if (onActivityChange) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'feeding_events',
          filter: `owner_id=eq.${userId}`,
        },
        onActivityChange,
      );
    }

    if (onDeviceStatusChange) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'device_status',
          filter: `owner_id=eq.${userId}`,
        },
        onDeviceStatusChange,
      );
    }

    if (onPetChange) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pets',
          filter: `owner_id=eq.${userId}`,
        },
        onPetChange,
      );
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'feeding_schedules',
          filter: `owner_id=eq.${userId}`,
        },
        onPetChange,
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onActivityChange, onDeviceStatusChange, onPetChange, userId]);
}
