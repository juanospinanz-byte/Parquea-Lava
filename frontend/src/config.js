import Constants from 'expo-constants';

const API_PORT = 3001;

// IP de respaldo: solo se usa si no se puede detectar automáticamente.
// Para encontrar tu IP: abre CMD, escribe 'ipconfig' y busca la dirección IPv4.
const FALLBACK_HOST = '172.20.10.2';

// En desarrollo, Expo expone la IP de la computadora que corre `expo start`
// (ej. "172.20.10.2:8081"). El backend corre en esa misma computadora,
// así que la URL se ajusta sola cuando cambias de red WiFi.
const getHost = () => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    return hostUri.split(':')[0];
  }
  return FALLBACK_HOST;
};

export const API_URL = `http://${getHost()}:${API_PORT}`;
