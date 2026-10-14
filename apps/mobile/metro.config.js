// Expo's default Metro config already understands pnpm workspaces (hoisted).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
