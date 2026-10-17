import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiProvider } from '@/api/context';
import { queryClient } from '@/lib/queryClient';
import { colors as c, fontFiles, fonts } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Tema de React Navigation: sin él, contenedores y transiciones usan el gris claro por defecto.
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: c.accent,
    background: c.bg,
    card: c.bg,
    text: c.text,
    border: c.border,
  },
};

export default function RootLayout() {
  // shortcut: ~400 KB de TTF en la primera carga web; pasar a woff2 recortado si pesa.
  const [loaded, error] = useFonts(fontFiles);
  const ready = loaded || Boolean(error); // si fallan, seguimos con las fuentes del sistema
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ApiProvider>
          <ThemeProvider value={navTheme}>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: c.bg },
                headerTintColor: c.text,
                headerShadowVisible: false,
                contentStyle: { backgroundColor: c.bg },
                headerTitleStyle: { fontFamily: fonts.display, fontSize: 22 },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen
                name="event/[slug]"
                options={{ title: '', headerTransparent: false, headerBackTitle: 'Volver' }}
              />
              <Stack.Screen
                name="diario"
                options={{ title: 'Tu diario', headerBackTitle: 'Volver' }}
              />
              <Stack.Screen
                name="amigos"
                options={{ title: 'Amigos', headerBackTitle: 'Volver' }}
              />
              <Stack.Screen
                name="ranking"
                options={{ title: 'Ranking', headerBackTitle: 'Volver' }}
              />
              <Stack.Screen name="+not-found" options={{ title: 'No encontrado' }} />
            </Stack>
          </ThemeProvider>
        </ApiProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
