import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import api from '../services/api';

// Las notificaciones se muestran también con la app abierta
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const REMINDER_ID = 'recordatorio-reserva';
const REMINDER_BEFORE_MS = 5 * 60 * 1000;

// Recordatorio programado ahora mismo, para no reprogramarlo en cada actualización
let scheduledReminder = null; // { id, when }
// true cuando este celular recibe notificaciones push del servidor
let remotePushEnabled = false;

// Con push remota activa, el servidor ya avisa de las reservas nuevas (no se duplica el aviso)
export const isRemotePushEnabled = () => remotePushEnabled;

export const ensureNotificationPermission = async () => {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Reservas',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return true;
    const { status: newStatus } = await Notifications.requestPermissionsAsync();
    return newStatus === 'granted';
  } catch (error) {
    return false;
  }
};

// Notificaciones push (llegan aunque la app esté cerrada). Necesitan un projectId de EAS
// (npx eas init) y, en Android, una build propia: Expo Go no las recibe. Sin eso, solo se usan
// las notificaciones locales de abajo, que sí funcionan en Expo Go.
export const registerPushToken = async () => {
  try {
    if (!(await ensureNotificationPermission())) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.put('/api/auth/push-token', { token: data });
    remotePushEnabled = true;
  } catch (error) {
    console.log('Notificaciones push no disponibles:', error.message);
  }
};

// Al cerrar sesión, el celular deja de recibir las notificaciones de esa cuenta
export const unregisterPushToken = async () => {
  remotePushEnabled = false;
  try {
    await api.put('/api/auth/push-token', { token: null });
  } catch (error) {
    // Sin conexión no pasa nada: el token se reemplaza en el próximo inicio de sesión
  }
};

// Notificación local inmediata (por ejemplo, al dueño cuando llega una reserva nueva)
export const notifyNow = async (title, body, data = {}) => {
  try {
    if (!(await ensureNotificationPermission())) return;
    await Notifications.scheduleNotificationAsync({ content: { title, body, data }, trigger: null });
  } catch (error) {
    console.log('No se pudo mostrar la notificación:', error.message);
  }
};

// Recordatorio al cliente 5 minutos antes de que venza su reserva
// (reserva con expiraLocal, ver withLocalExpiry en utils/reservas.js)
export const scheduleReservaReminder = async (reserva) => {
  if (!reserva) return cancelReservaReminder();
  const when = reserva.expiraLocal - REMINDER_BEFORE_MS;
  // Misma reserva y casi la misma hora: ya está programado
  if (scheduledReminder?.id === reserva.id && Math.abs(scheduledReminder.when - when) < 60 * 1000) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
    scheduledReminder = { id: reserva.id, when };
    if (when <= Date.now()) return;
    if (!(await ensureNotificationPermission())) return;
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: {
        title: 'Tu reserva vence en 5 minutos',
        body: `${reserva.parqueadero_nombre || 'Tu parqueadero'} · Placa ${reserva.placa}. Si no llegas, la celda se libera.`,
        data: { parqueaderoId: reserva.parqueadero_id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(when) },
    });
  } catch (error) {
    console.log('No se pudo programar el recordatorio:', error.message);
  }
};

export const cancelReservaReminder = async () => {
  if (!scheduledReminder) return;
  scheduledReminder = null;
  try {
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch (error) {
    // Nada que cancelar
  }
};
