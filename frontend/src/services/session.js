import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectRealtime, disconnectRealtime } from './realtime';
import {
  registerPushToken,
  unregisterPushToken,
  cancelReservaReminder,
} from '../utils/notifications';

// Después de iniciar sesión (o al abrir la app con sesión guardada): tiempo real y notificaciones
export const startSession = () => {
  connectRealtime();
  registerPushToken();
};

// Guarda la sesión que devuelve el login o el registro y la arranca
export const saveSession = async (token, usuario) => {
  await AsyncStorage.setItem('userToken', token);
  await AsyncStorage.setItem('userData', JSON.stringify(usuario));
  startSession();
};

// Cierra la sesión en este celular y vuelve al login
export const logout = async (navigation) => {
  await unregisterPushToken();
  disconnectRealtime();
  cancelReservaReminder();
  await AsyncStorage.multiRemove(['userToken', 'userData']);
  navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
};

// Datos del usuario guardados al iniciar sesión
export const getStoredUser = async () => {
  try {
    const data = await AsyncStorage.getItem('userData');
    return data ? JSON.parse(data) : null;
  } catch (error) {
    return null;
  }
};

export const updateStoredUser = async (changes) => {
  const user = (await getStoredUser()) || {};
  const updated = { ...user, ...changes };
  await AsyncStorage.setItem('userData', JSON.stringify(updated));
  return updated;
};
