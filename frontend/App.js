import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Notifications from 'expo-notifications';

import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import OwnerHomeScreen from './src/screens/OwnerHomeScreen';
import ClientHomeScreen from './src/screens/ClientHomeScreen';
import EditLocationScreen from './src/screens/EditLocationScreen';
import ParkingDetailScreen from './src/screens/ParkingDetailScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import { TABLET_MIN_SIDE } from './src/hooks/useResponsive';
import { navigationRef } from './src/services/navigation';
import { startSession } from './src/services/session';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [loading, setLoading] = useState(true);

  // Teléfonos: solo vertical. Tablets: vertical y horizontal.
  useEffect(() => {
    const { width, height } = Dimensions.get('screen');
    const isTablet = Math.min(width, height) >= TABLET_MIN_SIDE;
    ScreenOrientation.lockAsync(
      isTablet
        ? ScreenOrientation.OrientationLock.DEFAULT
        : ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch(() => {});
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        const userDataStr = await AsyncStorage.getItem('userData');
        
        if (token && userDataStr) {
          const userData = JSON.parse(userDataStr);
          if (userData.rol === 'dueno_parqueadero') {
            setInitialRoute('OwnerHome');
          } else {
            setInitialRoute('ClientHome');
          }
          // Sesión guardada: tiempo real y notificaciones
          startSession();
        } else {
          setInitialRoute('Login');
        }
      } catch (error) {
        setInitialRoute('Login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Al tocar una notificación se abre lo que corresponde
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data || {};
      if (!navigationRef.isReady()) return;
      if (data.parqueaderoId) {
        navigationRef.navigate('ParkingDetail', { parqueaderoId: data.parqueaderoId });
      } else if (data.tipo === 'reserva_completada') {
        navigationRef.navigate('History');
      }
    });
    return () => subscription.remove();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="OwnerHome" component={OwnerHomeScreen} />
          <Stack.Screen name="ClientHome" component={ClientHomeScreen} />
          <Stack.Screen name="EditLocation" component={EditLocationScreen} />
          <Stack.Screen name="ParkingDetail" component={ParkingDetailScreen} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="History" component={HistoryScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
