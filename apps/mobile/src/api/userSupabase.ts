import type { Database } from '@culturaba/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserAction, UserApi } from './types';

/** Filas propias del usuario autenticado (anónimo o no); RLS garantiza el aislamiento. */
export function createSupabaseUserApi(supabase: SupabaseClient<Database>, userId: string): UserApi {
  return {
    kind: 'supabase',
    id: userId,

    async getInterests() {
      const { data, error } = await supabase
        .from('user_interests')
        .select('discipline')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.discipline);
    },

    async setInterests(slugs) {
      const wanted = Array.from(new Set(slugs));
      const current = await this.getInterests();
      const toDelete = current.filter((d) => !wanted.includes(d));
      const toInsert = wanted.filter((d) => !current.includes(d));
      if (toDelete.length) {
        const { error } = await supabase
          .from('user_interests')
          .delete()
          .eq('user_id', userId)
          .in('discipline', toDelete);
        if (error) throw new Error(error.message);
      }
      if (toInsert.length) {
        const { error } = await supabase.from('user_interests').upsert(
          toInsert.map((discipline) => ({ user_id: userId, discipline })),
          { onConflict: 'user_id,discipline', ignoreDuplicates: true },
        );
        if (error) throw new Error(error.message);
      }
      if (wanted.length) {
        await supabase
          .from('profiles')
          .update({ onboarding_completed_at: new Date().toISOString() })
          .eq('id', userId)
          .is('onboarding_completed_at', null);
      }
    },

    async listActions() {
      const { data, error } = await supabase
        .from('user_event_actions')
        .select('event_id, action, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        eventId: r.event_id,
        action: r.action as UserAction,
        createdAt: r.created_at,
      }));
    },

    async addAction(eventId, action) {
      // Idempotente por la unique (user_id, event_id, action).
      const { error } = await supabase.from('user_event_actions').upsert(
        { user_id: userId, event_id: eventId, action },
        {
          onConflict: 'user_id,event_id,action',
          ignoreDuplicates: true,
        },
      );
      if (error) throw new Error(error.message);
    },

    async removeAction(eventId, action) {
      const { error } = await supabase
        .from('user_event_actions')
        .delete()
        .match({ user_id: userId, event_id: eventId, action });
      if (error) throw new Error(error.message);
    },
  };
}
