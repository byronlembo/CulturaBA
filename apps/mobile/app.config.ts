import type { ExpoConfig } from 'expo/config';

// Base pública de los enlaces compartidos (universal links / app links).
const webBaseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? 'https://culturaba.lembodiseno.com';
const webHost = new URL(webBaseUrl).host;

const config: ExpoConfig = {
  name: 'CulturaBA',
  slug: 'culturaba',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'culturaba',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'ar.com.culturaba.app',
    associatedDomains: [`applinks:${webHost}`],
  },
  android: {
    package: 'ar.com.culturaba.app',
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: '#181425',
    },
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: webHost, pathPrefix: '/event' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        backgroundColor: '#181425',
        imageWidth: 160,
      },
    ],
    'expo-web-browser',
  ],
  extra: {
    webBaseUrl,
  },
};

export default config;
