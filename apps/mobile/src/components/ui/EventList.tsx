import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import type { EventSummary, Page } from '@/api/types';
import { spacing, useColors } from '@/theme/tokens';
import { EventCard } from './EventCard';
import { EmptyState, ErrorState, Loading, Skeleton } from './Primitives';

type InfiniteEvents = UseInfiniteQueryResult<
  { pages: Page<EventSummary>[]; pageParams: unknown[] },
  Error
>;

export function EventListSkeleton() {
  return (
    <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg, paddingTop: spacing.md }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ gap: spacing.sm }}>
          <Skeleton height={180} />
          <Skeleton height={14} width="40%" />
          <Skeleton height={20} width="80%" />
          <Skeleton height={14} width="60%" />
        </View>
      ))}
    </View>
  );
}

export function EventList({
  query,
  header,
  empty,
}: {
  query: InfiniteEvents;
  header?: ReactElement;
  empty: { title: string; body?: string; action?: ReactElement };
}) {
  const c = useColors();
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  if (query.isPending) {
    return (
      <View>
        {header}
        <EventListSkeleton />
      </View>
    );
  }
  if (query.isError) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <ErrorState title="No pudimos cargar los eventos" onRetry={() => void query.refetch()} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(e) => e.id}
      renderItem={({ item }) => <EventCard event={item} />}
      ListHeaderComponent={header}
      ListEmptyComponent={
        <EmptyState title={empty.title} body={empty.body} action={empty.action} />
      }
      ListFooterComponent={
        query.isFetchingNextPage ? <Loading /> : <View style={{ height: spacing.xl }} />
      }
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => void query.refetch()}
          tintColor={c.accent}
        />
      }
      contentContainerStyle={{ paddingTop: spacing.md, flexGrow: 1 }}
    />
  );
}
