import type { Database } from '@culturaba/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { pointsErrorMessage } from '@/features/points/points';
import type { DiaryEntry, Friend, PointsMove, UserAction, UserApi } from './types';

type DiaryInsert = Database['public']['Tables']['diary_entries']['Insert'];

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

    async listDiary() {
      const { data, error } = await supabase
        .from('diary_entries')
        .select(
          'id, event_id, event_slug, event_title, discipline, venue_name, attended_on, rating, review',
        )
        .eq('user_id', userId)
        .order('attended_on', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map(
        (r): DiaryEntry => ({
          id: r.id,
          eventId: r.event_id,
          eventSlug: r.event_slug,
          eventTitle: r.event_title,
          discipline: r.discipline,
          venueName: r.venue_name,
          attendedOn: r.attended_on,
          rating: r.rating,
          review: r.review,
        }),
      );
    },

    async addDiaryEntry(eventId, input) {
      // El trigger copia título, slug, disciplina y sala del evento.
      const row = {
        user_id: userId,
        event_id: eventId,
        occurrence_id: input.occurrenceId,
        attended_on: input.attendedOn,
        rating: input.rating,
        review: input.review,
      } as DiaryInsert;
      const { error } = await supabase.from('diary_entries').insert(row);
      if (error?.code === '23505') throw new Error('Ya anotaste esa fecha en tu diario.');
      if (error) throw new Error(error.message);
    },

    async updateDiaryEntry(id, input) {
      const { error } = await supabase
        .from('diary_entries')
        .update({ rating: input.rating, review: input.review })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },

    async deleteDiaryEntry(id) {
      const { error } = await supabase.from('diary_entries').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },

    async checkIn(occurrenceId, at) {
      const { data, error } = await supabase.rpc('check_in', {
        p_occurrence_id: occurrenceId,
        p_lat: at.lat,
        p_lng: at.lng,
        p_accuracy_m: at.accuracy,
      });
      if (error) throw new Error(pointsErrorMessage(error.message));
      return data as { points: number; balance: number };
    },

    async getPoints() {
      const [balance, moves] = await Promise.all([
        supabase.rpc('my_points'),
        supabase
          .from('points_ledger')
          .select('delta, reason, note, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      if (balance.error) throw new Error(balance.error.message);
      if (moves.error) throw new Error(moves.error.message);
      return {
        balance: balance.data ?? 0,
        moves: (moves.data ?? []).map((m) => ({
          delta: m.delta,
          reason: m.reason as PointsMove['reason'],
          note: m.note,
          createdAt: m.created_at,
        })),
      };
    },

    async listRewards() {
      const { data, error } = await supabase
        .from('rewards')
        .select('id, title, description, terms, cost, stock, valid_until')
        .order('cost');
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        terms: r.terms,
        cost: r.cost,
        stock: r.stock,
        validUntil: r.valid_until,
      }));
    },

    async redeemReward(rewardId) {
      const { data, error } = await supabase.rpc('redeem_reward', { p_reward_id: rewardId });
      if (error) throw new Error(pointsErrorMessage(error.message));
      return data as { code: string; balance: number };
    },

    async listRedemptions() {
      const { data, error } = await supabase
        .from('redemptions')
        .select('id, code, cost, created_at, used_at, rewards(title)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        id: r.id,
        rewardTitle: r.rewards?.title ?? '',
        code: r.code,
        cost: r.cost,
        createdAt: r.created_at,
        usedAt: r.used_at,
      }));
    },

    async getUsername() {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.username ?? null;
    },

    async setUsername(username) {
      const { error } = await supabase
        .from('profiles')
        .update({ username: username.trim().replace(/^@/, '').toLowerCase() })
        .eq('id', userId);
      if (error?.code === '23505') throw new Error('Ese @usuario ya está tomado.');
      if (error?.code === '23514')
        throw new Error('Usá de 3 a 20 letras minúsculas, números o guion bajo.');
      if (error) throw new Error(error.message);
    },

    async listFriends() {
      const { data, error } = await supabase.rpc('my_friends');
      if (error) throw new Error(pointsErrorMessage(error.message));
      return (data ?? []) as Friend[];
    },

    async sendFriendRequest(username) {
      const { data, error } = await supabase.rpc('send_friend_request', { p_username: username });
      if (error) throw new Error(pointsErrorMessage(error.message));
      return data as 'sent' | 'accepted' | 'pending' | 'already_friends';
    },

    async respondFriendRequest(username, accept) {
      const { error } = await supabase.rpc('respond_friend_request', {
        p_username: username,
        p_accept: accept,
      });
      if (error) throw new Error(pointsErrorMessage(error.message));
    },

    async removeFriend(username) {
      const { error } = await supabase.rpc('remove_friend', { p_username: username });
      if (error) throw new Error(pointsErrorMessage(error.message));
    },

    async leaderboard(scope, since) {
      const { data, error } = await supabase.rpc('leaderboard', {
        p_scope: scope,
        ...(since ? { p_since: since } : {}),
      });
      if (error) throw new Error(pointsErrorMessage(error.message));
      return (data ?? []).map((r) => ({
        rank: r.rank,
        username: r.username,
        points: r.points,
        isMe: r.is_me,
      }));
    },
  };
}
