import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/app/AppContext';
import { DialogProvider } from './src/components/DialogProvider';
import { AssistantProvider } from './src/assistant/AssistantProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

function Root() {
  const { ready, error } = useApp();
  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#FFFFFF' }}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#B42318', textAlign: 'center' }}>ROOSTER could not start</Text>
        <Text style={{ fontSize: 18, color: '#0B1B33', textAlign: 'center', marginTop: 12 }}>{error}</Text>
      </View>
    );
  }
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }} accessibilityLabel="Loading ROOSTER">
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }
  return (
    <DialogProvider>
      <AssistantProvider>
        <RootNavigator />
      </AssistantProvider>
    </DialogProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}
