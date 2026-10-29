import { Alert, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { normalizarDireccion, ciudadCercana, distanciaKm, CITY_RADIUS_KM } from './direccion';

// Coordenadas que versiones anteriores de la app guardaban cuando no se marcaba la ubicación (Bogotá)
const LEGACY_DEFAULT_COORDS = { latitude: 4.711, longitude: -74.0721 };

export const isLegacyDefaultCoords = (lat, lng) =>
  Math.abs(parseFloat(lat) - LEGACY_DEFAULT_COORDS.latitude) < 0.0001 &&
  Math.abs(parseFloat(lng) - LEGACY_DEFAULT_COORDS.longitude) < 0.0001;

// Un parqueadero tiene ubicación válida si tiene coordenadas y no son las de Bogotá por defecto
export const hasValidCoords = (item) =>
  !!item?.latitud && !!item?.longitud && !isLegacyDefaultCoords(item.latitud, item.longitud);

// Pide permiso de ubicación y devuelve true si se concedió. Si el usuario ya lo negó antes,
// el sistema no vuelve a mostrar el diálogo: solo se puede activar desde los Ajustes del celular.
export const ensureLocationPermission = async () => {
  if (!(await Location.hasServicesEnabledAsync())) {
    Alert.alert(
      'Ubicación desactivada',
      Platform.OS === 'ios'
        ? 'Activa los Servicios de Ubicación en Ajustes > Privacidad y seguridad > Localización e inténtalo de nuevo.'
        : 'Activa la ubicación (GPS) del celular e inténtalo de nuevo.'
    );
    return false;
  }

  const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
  if (status === 'granted') return true;

  if (canAskAgain) {
    Alert.alert('Permiso denegado', 'Necesitamos acceso a tu ubicación para configurar el parqueadero.');
  } else {
    Alert.alert(
      'Permiso de ubicación desactivado',
      'Antes se negó el acceso a la ubicación. Actívalo en los Ajustes de la app (Ubicación > "Al usar la app") para usar el GPS.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
      ]
    );
  }
  return false;
};

// Convierte una dirección escrita (ej: "ac.24 #95a-80, Bogotá") en coordenadas con el
// geocodificador del propio celular (sin API key). Antes se normaliza la nomenclatura.
// near (opcional) es dónde está el dueño, para deducir la ciudad si no se escribió.
// Devuelve { latitude, longitude, direccion } o null.
export const geocodeAddress = async (address, near = null) => {
  const normalizada = normalizarDireccion(address, ciudadCercana(near));
  if (!normalizada) return null;
  try {
    const results = await Location.geocodeAsync(normalizada.consulta);
    const { ciudad } = normalizada;
    // Un punto en otra ciudad es justo el error que se quiere evitar: se descarta
    const result = results.find(
      (r) =>
        !ciudad ||
        distanciaKm(r.latitude, r.longitude, ciudad.latitude, ciudad.longitude) <= CITY_RADIUS_KM
    );
    if (!result) return null;
    return {
      latitude: result.latitude,
      longitude: result.longitude,
      direccion: normalizada.direccion,
    };
  } catch (e) {
    return null;
  }
};

// Abre la app de mapas del celular: Apple Maps en iPhone; en Android la app predeterminada
// (Google Maps, Waze, etc.) o el selector de apps si hay varias.
const openNativeMaps = (nativeUrl, webUrl) => {
  Linking.openURL(nativeUrl).catch(() => {
    Linking.openURL(webUrl).catch(() => {
      Alert.alert('Sin app de mapas', 'No encontramos una app de mapas en este celular.');
    });
  });
};

// Muestra un punto en la app de mapas
export const openInMaps = ({ latitude, longitude, label = 'Parqueadero' }) => {
  const name = encodeURIComponent(label);
  if (Platform.OS === 'ios') {
    openNativeMaps(
      `maps:?q=${name}&ll=${latitude},${longitude}`,
      `https://maps.apple.com/?q=${name}&ll=${latitude},${longitude}`
    );
  } else {
    openNativeMaps(
      `geo:${latitude},${longitude}?q=${latitude},${longitude}(${name})`,
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    );
  }
};

// Abre la ruta hasta un punto en la app de mapas. Android no tiene un formato estándar
// de rutas, así que ahí se abre el punto y la app ofrece "Cómo llegar".
export const openDirections = ({ latitude, longitude, label = 'Parqueadero' }) => {
  if (Platform.OS === 'ios') {
    openNativeMaps(
      `maps:?daddr=${latitude},${longitude}&dirflg=d`,
      `https://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=d`
    );
  } else {
    openInMaps({ latitude, longitude, label });
  }
};
