import { useEffect } from 'react';

import { supabase } from '@/utils/supabase';

type PawsRealtimeOptions = {
  userId?: string;
  onActivityChange?: () => void;
  onDeviceStatusChange?: () => void;
};

export function usePawsRealtime({
  userId,
  onActivityChange,
  onDeviceStatusChange,
}: PawsRealtimeOptions) {
  useEffect(() => {
    if (!userId || (!onActivityChange && !onDeviceStatusChange)) {
      return;
    }

    const channel = supabase.channel(`paws-realtime:${userId}`);

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

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onActivityChange, onDeviceStatusChange, userId]);
}
