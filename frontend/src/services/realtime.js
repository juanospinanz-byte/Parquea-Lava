import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

// Conexión de tiempo real (WebSocket): el servidor avisa cuando algo cambia.
// Eventos: 'parqueadero:actualizado' { id } y 'reservas:actualizadas'.
let socket = null;
let currentToken = null;

// Conecta con la sesión guardada (o reconecta si cambió de usuario)
export const connectRealtime = async () => {
  const token = await AsyncStorage.getItem('userToken');
  if (!token) {
    disconnectRealtime();
    return null;
  }
  if (socket && currentToken === token) return socket;

  disconnectRealtime();
  currentToken = token;
  socket = io(API_URL, { transports: ['websocket'], auth: { token } });
  return socket;
};

export const disconnectRealtime = () => {
  if (socket) socket.disconnect();
  socket = null;
  currentToken = null;
};

// Escucha un evento; devuelve una función para dejar de escucharlo
export const onRealtime = (event, handler) => {
  let active = true;
  let connected = null;
  connectRealtime().then((s) => {
    if (active && s) {
      connected = s;
      s.on(event, handler);
    }
  });
  return () => {
    active = false;
    if (connected) connected.off(event, handler);
  };
};
