import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';

// Expo Go en iPhone no incluye el SDK de Google Maps: ahí se usa Apple Maps.
// En Android y en builds propias (development build / App Store) se usa Google Maps.
const isExpoGoIOS = Platform.OS === 'ios' && Constants.executionEnvironment === 'storeClient';
export const MAP_PROVIDER = isExpoGoIOS ? undefined : PROVIDER_GOOGLE;

// Coordenadas que versiones anteriores de la app guardaban cuando no se marcaba la ubicación (Bogotá)
const LEGACY_DEFAULT_COORDS = { latitude: 4.711, longitude: -74.0721 };

export const isLegacyDefaultCoords = (lat, lng) =>
  Math.abs(parseFloat(lat) - LEGACY_DEFAULT_COORDS.latitude) < 0.0001 &&
  Math.abs(parseFloat(lng) - LEGACY_DEFAULT_COORDS.longitude) < 0.0001;

// Un parqueadero tiene ubicación válida si tiene coordenadas y no son las de Bogotá por defecto
export const hasValidCoords = (item) =>
  !!item?.latitud && !!item?.longitud && !isLegacyDefaultCoords(item.latitud, item.longitud);

// Convierte una dirección escrita (ej: "Cra 81c #49f-50, Medellín") en coordenadas
export const geocodeAddress = async (address) => {
  if (!address?.trim()) return null;
  const query = /colombia/i.test(address) ? address : `${address}, Colombia`;
  try {
    const [result] = await Location.geocodeAsync(query);
    return result ? { latitude: result.latitude, longitude: result.longitude } : null;
  } catch (e) {
    return null;
  }
};
