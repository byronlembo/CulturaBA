import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiProvider } from '@/api/context';
import { queryClient } from '@/lib/queryClient';
import { palette } from '@/theme/tokens';

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? palette.dark : palette.light;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ApiProvider>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: c.bg },
              headerTintColor: c.text,
              headerShadowVisible: false,
              contentStyle: { backgroundColor: c.bg },
              headerTitleStyle: { fontWeight: '700' },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="event/[slug]"
              options={{ title: '', headerTransparent: false, headerBackTitle: 'Volver' }}
            />
            <Stack.Screen name="+not-found" options={{ title: 'No encontrado' }} />
          </Stack>
        </ApiProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
