import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import api from '../services/api';
import useResponsive from '../hooks/useResponsive';
import { MAP_PROVIDER, hasValidCoords } from '../utils/maps';

// US06: cada cuánto se consulta de nuevo el parqueadero mientras la pantalla está abierta
const REFRESH_INTERVAL_MS = 5000;

const VEHICLE_TYPES = [
  { key: 'motos', label: 'Motos', singular: 'Moto', icon: 'motorbike', IconSet: MaterialCommunityIcons },
  { key: 'carros', label: 'Carros', singular: 'Carro', icon: 'car-sport', IconSet: Ionicons },
  { key: 'camiones', label: 'Camiones', singular: 'Camión', icon: 'truck-outline', IconSet: MaterialCommunityIcons },
];

const formatPrice = (value) => `$${parseFloat(value || 0).toLocaleString()}`;

const formatTime = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const ParkingDetailScreen = ({ navigation, route }) => {
  const parqueaderoId = route.params?.parqueaderoId;
  const distanceText = route.params?.distanceText;

  // Se muestra de inmediato lo que llegó desde la lista y luego se sincroniza con el servidor
  const [parqueadero, setParqueadero] = useState(route.params?.parqueadero || null);
  const [loading, setLoading] = useState(!route.params?.parqueadero);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [syncError, setSyncError] = useState(false);

  const { isTablet, isWideLayout } = useResponsive();

  const fetchParqueadero = useCallback(async () => {
    try {
      const response = await api.get(`/api/parqueadero/${parqueaderoId}`);
      setParqueadero(response.data);
      setLastUpdated(new Date());
      setSyncError(false);
    } catch (error) {
      console.error(error);
      setSyncError(true);
    } finally {
      setLoading(false);
    }
  }, [parqueaderoId]);

  // Consulta en tiempo real: se refresca al entrar y cada pocos segundos mientras la pantalla esté visible
  useFocusEffect(
    useCallback(() => {
      fetchParqueadero();
      const interval = setInterval(fetchParqueadero, REFRESH_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [fetchParqueadero])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchParqueadero();
    setRefreshing(false);
  };

  const openExternalMaps = () => {
    if (!parqueadero.latitud || !parqueadero.longitud) {
      Alert.alert('Sin coordenadas', 'Este parqueadero aún no tiene coordenadas GPS registradas.');
      return;
    }
    const lat = parseFloat(parqueadero.latitud);
    const lng = parseFloat(parqueadero.longitud);
    const label = encodeURIComponent(parqueadero.nombre || 'Parqueadero');
    // Ruta en Google Maps desde la ubicación actual; abre la app si está instalada, si no el navegador
    const googleMapsWeb = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    const url = Platform.select({
      ios: `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`,
      android: `google.navigation:q=${lat},${lng}`,
      default: googleMapsWeb,
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(googleMapsWeb).catch(() => {
        if (Platform.OS === 'ios') Linking.openURL(`maps:0,0?daddr=${lat},${lng}&q=${label}`);
      });
    });
  };

  const handleReserve = () => {
    Alert.alert('Reservar espacio', 'La reserva de espacios estará disponible próximamente.');
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity style={styles.headerBtn}>
        <Ionicons name="person-outline" size={20} color="#8E8E93" />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        {renderHeader()}
        <ActivityIndicator size="large" color="#FFD200" style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!parqueadero) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        {renderHeader()}
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#3A3A3C" />
          <Text style={styles.emptyTitle}>No se pudo cargar el parqueadero</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchParqueadero}>
            <Text style={styles.retryButtonText}>REINTENTAR</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const hasCoords = hasValidCoords(parqueadero);

  const renderAvailability = () => (
    <>
      <Text style={styles.sectionTitle}>ESTADO DE DISPONIBILIDAD</Text>
      {VEHICLE_TYPES.map(({ key, label, icon, IconSet }) => {
        const disponibles = parqueadero[`${key}_disponibles`] || 0;
        const max = parqueadero[`${key}_max`] || 0;
        const ratio = max > 0 ? Math.min(disponibles / max, 1) : 0;

        return (
          <View key={key} style={styles.availabilityCard}>
            <View style={styles.availabilityTopRow}>
              <View style={styles.availabilityLabelRow}>
                <IconSet name={icon} size={20} color="#FFD200" />
                <Text style={styles.availabilityLabel}>{label}</Text>
              </View>
              <Text style={[styles.availabilityCount, disponibles === 0 && styles.availabilityCountEmpty]}>
                {disponibles} / {max} Celdas
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${ratio * 100}%` }]} />
            </View>
          </View>
        );
      })}
    </>
  );

  const renderPrices = () => (
    <>
      <Text style={styles.sectionTitle}>PRECIO POR HORA</Text>
      <View style={styles.priceRow}>
        {VEHICLE_TYPES.map(({ key, singular, icon, IconSet }) => (
          <View key={key} style={styles.priceCard}>
            <IconSet name={icon} size={18} color="#8E8E93" />
            <Text style={styles.priceValue}>{formatPrice(parqueadero[`${key}_precio`])}</Text>
            <Text style={styles.priceUnit}>{singular} / hora</Text>
          </View>
        ))}
      </View>
    </>
  );

  const renderLocation = () => (
    <>
      <Text style={styles.sectionTitle}>DIRECCIÓN & UBICACIÓN</Text>
      <View style={styles.locationCard}>
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={20} color="#FFD200" />
          <Text style={styles.addressText}>
            {parqueadero.direccion || 'Sin dirección registrada'}
          </Text>
        </View>

        {parqueadero.detalles_ubicacion ? (
          <Text style={styles.detailsText}>{parqueadero.detalles_ubicacion}</Text>
        ) : null}

        {hasCoords ? (
          <View style={[styles.mapContainer, isWideLayout && styles.mapContainerWide]}>
            <MapView
              provider={MAP_PROVIDER}
              style={styles.map}
              region={{
                latitude: parseFloat(parqueadero.latitud),
                longitude: parseFloat(parqueadero.longitud),
                latitudeDelta: 0.006,
                longitudeDelta: 0.006,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Marker
                coordinate={{
                  latitude: parseFloat(parqueadero.latitud),
                  longitude: parseFloat(parqueadero.longitud),
                }}
                title={parqueadero.nombre}
                description={parqueadero.direccion}
              >
                <Ionicons name="location" size={32} color="#FFD200" />
              </Marker>
            </MapView>
            {distanceText ? (
              <View style={styles.mapDistanceBadge}>
                <Ionicons name="navigate" size={12} color="#FFD200" />
                <Text style={styles.mapDistanceText}>{distanceText}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.noMapBox}>
            <Ionicons name="map-outline" size={22} color="#3A3A3C" />
            <Text style={styles.noMapText}>El dueño aún no ha marcado la ubicación en el mapa</Text>
          </View>
        )}

        {hasCoords ? (
          <TouchableOpacity style={styles.directionsButton} onPress={openExternalMaps} activeOpacity={0.8}>
            <Ionicons name="navigate" size={16} color="#FFD200" />
            <Text style={styles.directionsButtonText}>CÓMO LLEGAR</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      {renderHeader()}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, isTablet && styles.tabletPadding]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#FFD200"
            colors={['#FFD200']}
          />
        }
      >
        <Text style={styles.title}>Detalle Parqueadero</Text>
        <Text style={styles.subtitle}>{parqueadero.nombre || 'Parqueadero'}</Text>

        {/* Indicador de sincronización en tiempo real */}
        <View style={styles.liveRow}>
          <View style={[styles.liveDot, syncError && styles.liveDotError]} />
          <Text style={styles.liveText}>
            {syncError
              ? 'Sin conexión · mostrando últimos datos'
              : lastUpdated
              ? `En vivo · actualizado ${formatTime(lastUpdated)}`
              : 'Sincronizando...'}
          </Text>
        </View>

        <View style={isWideLayout && styles.columns}>
          <View style={isWideLayout && styles.column}>
            {renderAvailability()}
            {renderPrices()}
          </View>
          <View style={isWideLayout && styles.column}>
            {renderLocation()}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomContainer, isTablet && styles.tabletPadding]}>
        <TouchableOpacity style={styles.reserveButton} onPress={handleReserve} activeOpacity={0.8}>
          <Text style={styles.reserveButtonText}>RESERVAR ESPACIO</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  tabletPadding: {
    paddingHorizontal: 40,
  },
  columns: {
    flexDirection: 'row',
    gap: 24,
  },
  column: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 10,
  },

  // Indicador en vivo
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
    marginRight: 6,
  },
  liveDotError: {
    backgroundColor: '#FF5252',
  },
  liveText: {
    fontSize: 12,
    color: '#8E8E93',
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8E8E93',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // Disponibilidad
  availabilityCard: {
    backgroundColor: '#161618',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#262628',
  },
  availabilityTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  availabilityLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  availabilityLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  availabilityCount: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  availabilityCountEmpty: {
    color: '#FF5252',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0F0F11',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#FFD200',
  },

  // Precios
  priceRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 20,
  },
  priceCard: {
    flex: 1,
    backgroundColor: '#161618',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262628',
  },
  priceValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD200',
    marginTop: 6,
  },
  priceUnit: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },

  // Ubicación
  locationCard: {
    backgroundColor: '#161618',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#262628',
    marginBottom: 20,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addressText: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  detailsText: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
    marginLeft: 30,
  },
  mapContainer: {
    height: 130,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 12,
  },
  mapContainerWide: {
    height: 260,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapDistanceBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  mapDistanceText: {
    color: '#FFD200',
    fontSize: 11,
    fontWeight: 'bold',
  },
  noMapBox: {
    marginTop: 12,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#0F0F11',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 6,
  },
  noMapText: {
    fontSize: 12,
    color: '#5A5A5E',
    textAlign: 'center',
  },
  directionsButton: {
    marginTop: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3D3D20',
    backgroundColor: '#1F1F10',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  directionsButtonText: {
    color: '#FFD200',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },

  // Estado vacío / error
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#8E8E93',
    marginTop: 14,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#FFD200',
    paddingHorizontal: 24,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#000000',
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },

  // Botón reservar
  bottomContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 10,
  },
  reserveButton: {
    backgroundColor: '#FFD200',
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reserveButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});

export default ParkingDetailScreen;
