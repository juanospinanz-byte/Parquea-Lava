import axios from 'axios';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { resetToLogin } from './navigation';
import { disconnectRealtime } from './realtime';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('userToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Evita mostrar el aviso varias veces cuando fallan varias peticiones a la vez
let handlingExpiredSession = false;

// Sesión vencida (el token dura 30 días) o inválida: se cierra la sesión y se vuelve al login
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const isAuthRequest = error.config?.url?.startsWith('/api/auth/');
    const sentToken = !!error.config?.headers?.Authorization;

    if (error.response?.status === 401 && sentToken && !isAuthRequest) {
      if (!handlingExpiredSession) {
        handlingExpiredSession = true;
        disconnectRealtime();
        await AsyncStorage.multiRemove(['userToken', 'userData']);
        resetToLogin();
        Alert.alert('Sesión expirada', 'Por seguridad tu sesión se cerró. Inicia sesión de nuevo.');
        setTimeout(() => {
          handlingExpiredSession = false;
        }, 3000);
      }
      // La pantalla que hizo la petición se cierra al volver al login: la petición se deja sin
      // respuesta para que no muestre errores ni alertas de más
      return new Promise(() => {});
    }

    return Promise.reject(error);
  }
);

export default api;
