import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import api from '../services/api';
import useResponsive from '../hooks/useResponsive';
import { hasValidCoords } from '../utils/maps';
import { findCity } from '../constants/cities';
import CityPickerModal from '../components/CityPickerModal';

// Bogotá center as reference default
const DEFAULT_USER_COORDS = {
  latitude: 4.6280,
  longitude: -74.0645,
};

// Calculate distance between two coordinates in kilometers (Haversine formula)
const calculateDistanceKm = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Format distance string like "A 200m" or "A 1.2km"
const formatDistance = (km, fallbackIndex = 0) => {
  if (km === null || km === undefined) {
    const fallbacks = ['A 200m', 'A 1.2km', 'A 850m', 'A 2.5km'];
    return fallbacks[fallbackIndex % fallbacks.length];
  }
  if (km < 1) {
    const meters = Math.round(km * 1000);
    return `A ${meters}m`;
  }
  return `A ${km.toFixed(1)}km`;
};

const getTotalDisponibles = (item) =>
  (item.motos_disponibles || 0) + (item.carros_disponibles || 0) + (item.camiones_disponibles || 0);

// US05: cada cuánto se refresca la lista mientras la pantalla está visible
const REFRESH_INTERVAL_MS = 10000;

// Radio (km) que se considera "la ciudad" del usuario, cubre el área metropolitana
const CITY_RADIUS_KM = 30;
// Solo se vuelve a consultar el nombre de la ciudad si el usuario se movió más de esto
const REGEOCODE_DISTANCE_KM = 2;

const isInsideCity = (coords, city) =>
  !!city &&
  calculateDistanceKm(coords.latitude, coords.longitude, city.latitude, city.longitude) <=
    CITY_RADIUS_KM;

const getCityName = async (coords) => {
  try {
    const [place] = await Location.reverseGeocodeAsync(coords);
    return place?.city || place?.subregion || place?.region || null;
  } catch (e) {
    return null;
  }
};

const ClientHomeScreen = ({ navigation, route }) => {
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [parqueaderos, setParqueaderos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState(DEFAULT_USER_COORDS);
  // true cuando ya se tiene una posición real del GPS (no la de Bogotá por defecto)
  const [hasRealLocation, setHasRealLocation] = useState(false);
  const [userCity, setUserCity] = useState(null);
  const lastGeocodedRef = useRef(null);

  // Ciudad elegida al registrarse: los resultados se basan en ella
  const [homeCity, setHomeCity] = useState(null);
  const [cityPickerVisible, setCityPickerVisible] = useState(false);

  // Modals state
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  // Filter state
  const [vehicleFilter, setVehicleFilter] = useState('todos'); // 'todos', 'motos', 'carros', 'camiones'
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const { isTablet } = useResponsive();

  useEffect(() => {
    const getUserData = async () => {
      let userData = route.params?.user?.nombre ? route.params.user : null;
      if (!userData) {
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) userData = JSON.parse(userDataStr);
      }
      if (userData) {
        setUserName(userData.nombre);
        setUserEmail(userData.correo || '');
        setHomeCity(findCity(userData.ciudad));
      }
    };
    getUserData();
  }, []);

  const changeHomeCity = async (city) => {
    setCityPickerVisible(false);
    setHomeCity(city);
    try {
      const userDataStr = await AsyncStorage.getItem('userData');
      if (userDataStr) {
        const userData = JSON.parse(userDataStr);
        await AsyncStorage.setItem('userData', JSON.stringify({ ...userData, ciudad: city.nombre }));
      }
      await api.put('/api/auth/ciudad', { ciudad: city.nombre });
    } catch (error) {
      console.error(error);
      Alert.alert('Aviso', 'La ciudad se cambió en este celular, pero no se pudo guardar en tu cuenta.');
    }
  };

  // Sigue la ubicación del usuario en tiempo real mientras la pantalla está visible
  useFocusEffect(
    useCallback(() => {
      let subscription = null;
      let cancelled = false;

      const startWatching = async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted' || cancelled) return;

          // Última posición conocida del celular para no esperar al GPS
          const lastKnown = await Location.getLastKnownPositionAsync();
          if (lastKnown && !cancelled) handleLocationUpdate(lastKnown);

          // Sin mapa basta con precisión media: solo se usa para distancias y ciudad
          const sub = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              distanceInterval: 50,
              timeInterval: 5000,
            },
            handleLocationUpdate
          );
          if (cancelled) sub.remove();
          else subscription = sub;
        } catch (e) {
          // Keep default Bogotá coords
        }
      };
      startWatching();

      return () => {
        cancelled = true;
        subscription?.remove();
      };
    }, [])
  );

  // Refresca al volver a la pantalla y periódicamente para mantener la disponibilidad al día
  useFocusEffect(
    useCallback(() => {
      fetchParqueaderos();
      const interval = setInterval(() => fetchParqueaderos(true), REFRESH_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [])
  );

  const handleLocationUpdate = async (loc) => {
    const coords = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    };
    setUserLocation(coords);
    setHasRealLocation(true);

    // La geocodificación inversa tiene límite de uso: solo se repite al moverse bastante
    const last = lastGeocodedRef.current;
    const moved = last
      ? calculateDistanceKm(last.latitude, last.longitude, coords.latitude, coords.longitude)
      : null;
    if (last && moved < REGEOCODE_DISTANCE_KM) return;

    lastGeocodedRef.current = coords;
    const gpsCity = await getCityName(coords);
    if (gpsCity) setUserCity(gpsCity);
  };

  // silent: refresco en segundo plano, sin alertas de error
  const fetchParqueaderos = async (silent = false) => {
    try {
      const response = await api.get('/api/parqueadero/todos');
      setParqueaderos(response.data);
    } catch (error) {
      console.error(error);
      if (!silent) {
        Alert.alert('Error', 'No se pudieron cargar los parqueaderos');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchParqueaderos();
    setRefreshing(false);
  };

  const openDetail = (item) => {
    navigation.navigate('ParkingDetail', {
      parqueaderoId: item.id,
      parqueadero: item,
      distanceText: item.distanceText,
    });
  };

  const handleLogout = async () => {
    setProfileModalVisible(false);
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('userData');
    navigation.replace('Login');
  };

  // Processed and filtered list
  const filteredParqueaderos = useMemo(() => {
    // Centro de la ciudad que se muestra: la elegida al registrarse o, si no hay, la del GPS
    const cityCenter = homeCity || (hasRealLocation ? userLocation : null);
    // La distancia se mide desde el usuario si está en esa ciudad; si no, desde el centro de la ciudad
    const distanceOrigin =
      hasRealLocation && (!homeCity || isInsideCity(userLocation, homeCity))
        ? userLocation
        : cityCenter;

    return parqueaderos
      .map((item, index) => {
        let distanceKm = null;
        let cityDistanceKm = null;
        if (hasValidCoords(item)) {
          const lat = parseFloat(item.latitud);
          const lng = parseFloat(item.longitud);
          if (distanceOrigin) {
            distanceKm = calculateDistanceKm(distanceOrigin.latitude, distanceOrigin.longitude, lat, lng);
          }
          if (cityCenter) {
            cityDistanceKm = calculateDistanceKm(cityCenter.latitude, cityCenter.longitude, lat, lng);
          }
        }
        return {
          ...item,
          calculatedDistance: distanceKm,
          cityDistance: cityDistanceKm,
          distanceText: formatDistance(distanceKm, index),
        };
      })
      .filter((item) => {
        // Sin búsqueda, solo se muestran los parqueaderos de la ciudad del usuario.
        // Al buscar se consulta en todas las ciudades.
        if (cityCenter && !searchQuery.trim()) {
          if (item.cityDistance === null || item.cityDistance > CITY_RADIUS_KM) return false;
        }

        // Search query filter (by name, address, or additional details)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = item.nombre && item.nombre.toLowerCase().includes(q);
          const matchDir = item.direccion && item.direccion.toLowerCase().includes(q);
          const matchDet = item.detalles_ubicacion && item.detalles_ubicacion.toLowerCase().includes(q);
          if (!matchName && !matchDir && !matchDet) return false;
        }

        // Vehicle availability filter
        if (vehicleFilter === 'motos' && (item.motos_disponibles || 0) <= 0) return false;
        if (vehicleFilter === 'carros' && (item.carros_disponibles || 0) <= 0) return false;
        if (vehicleFilter === 'camiones' && (item.camiones_disponibles || 0) <= 0) return false;

        // Only available filter
        if (onlyAvailable && getTotalDisponibles(item) <= 0) return false;

        return true;
      })
      .sort((a, b) => {
        if (a.calculatedDistance !== null && b.calculatedDistance !== null) {
          return a.calculatedDistance - b.calculatedDistance;
        }
        return 0;
      });
  }, [parqueaderos, searchQuery, vehicleFilter, onlyAvailable, userLocation, hasRealLocation, homeCity]);

  // Nombre de la ciudad que se está mostrando
  const shownCityName = homeCity?.nombre || userCity;
  const showingCity = !!(homeCity || hasRealLocation) && !searchQuery.trim();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.parkappBadge}>
          <Text style={styles.parkappText}>PARKAPP</Text>
        </View>

        <TouchableOpacity
          style={styles.profileBadge}
          onPress={() => setProfileModalVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="person-outline" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
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
        {/* Title Section */}
        <Text style={styles.title}>Parqueaderos</Text>
        <Text style={styles.subtitle}>
          {shownCityName
            ? `Encuentra espacios disponibles en ${shownCityName}`
            : 'Encuentra espacios disponibles cerca de ti'}
        </Text>

        {/* Ciudad del cliente: toca para cambiarla */}
        <TouchableOpacity
          style={styles.cityChip}
          onPress={() => setCityPickerVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="location" size={16} color="#FFD200" />
          <Text style={styles.cityChipText}>{homeCity ? homeCity.nombre : 'Elige tu ciudad'}</Text>
          <Text style={styles.cityChipAction}>Cambiar</Text>
        </TouchableOpacity>

        {/* Search & Filter Bar */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={18} color="#8E8E93" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por ubicación..."
              placeholderTextColor="#666668"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#8E8E93" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.filterButton,
              (vehicleFilter !== 'todos' || onlyAvailable) && styles.filterButtonActive,
            ]}
            onPress={() => setFilterModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="options" size={22} color="#000000" />
          </TouchableOpacity>
        </View>

        {/* Section Title */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            {showingCity && shownCityName
              ? `RESULTADOS CERCANOS EN ${shownCityName.toUpperCase()}`
              : 'RESULTADOS CERCANOS'}
          </Text>
          {(vehicleFilter !== 'todos' || onlyAvailable) && (
            <TouchableOpacity
              onPress={() => {
                setVehicleFilter('todos');
                setOnlyAvailable(false);
              }}
            >
              <Text style={styles.clearFilterText}>Limpiar filtro</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Parking Lot Cards */}
        {loading ? (
          <ActivityIndicator size="large" color="#FFD200" style={{ marginTop: 30 }} />
        ) : filteredParqueaderos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="car-outline" size={48} color="#3A3A3C" />
            <Text style={styles.emptyTitle}>
              {showingCity
                ? `No hay parqueaderos en ${shownCityName || 'tu ciudad'}`
                : 'No se encontraron parqueaderos'}
            </Text>
            <Text style={styles.emptySubtitle}>
              Prueba buscando por otra ubicación o ajusta los filtros.
            </Text>
          </View>
        ) : (
          filteredParqueaderos.map((item) => {
            const isMotoLow = (item.motos_disponibles || 0) <= 2 && (item.motos_disponibles || 0) > 0;
            const isCarroLow = (item.carros_disponibles || 0) <= 2 && (item.carros_disponibles || 0) > 0;
            const isCamionLow = (item.camiones_disponibles || 0) <= 2 && (item.camiones_disponibles || 0) > 0;

            return (
              <View key={item.id} style={styles.card}>
                {/* Header: Name and Distance Badge */}
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.nombre || 'Parqueadero'}
                  </Text>
                  <View style={styles.distanceBadge}>
                    <Text style={styles.distanceText}>{item.distanceText}</Text>
                  </View>
                </View>

                {/* Physical Address */}
                <Text style={styles.cardAddress} numberOfLines={1}>
                  {item.direccion || 'Sin dirección registrada'}
                </Text>

                {/* Availability Pills */}
                <View style={styles.pillsRow}>
                  {/* Moto Pill */}
                  <View style={[styles.pill, isMotoLow && styles.pillWarning]}>
                    <MaterialCommunityIcons name="motorbike" size={14} color="#FFFFFF" />
                    <Text style={styles.pillNumber}>{item.motos_disponibles || 0}</Text>
                    <Text style={styles.pillLabel}> Moto</Text>
                  </View>

                  {/* Carro Pill */}
                  <View style={[styles.pill, isCarroLow && styles.pillWarning]}>
                    <Ionicons name="car-sport" size={14} color="#FFFFFF" />
                    <Text style={styles.pillNumber}>{item.carros_disponibles || 0}</Text>
                    <Text style={styles.pillLabel}> Carro</Text>
                  </View>

                  {/* Camión Pill */}
                  <View style={[styles.pill, isCamionLow && styles.pillWarning]}>
                    <MaterialCommunityIcons name="truck-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.pillNumber}>{item.camiones_disponibles || 0}</Text>
                    <Text style={styles.pillLabel}> Camión</Text>
                  </View>
                </View>

                {/* VER DETALLES Button */}
                <TouchableOpacity
                  style={styles.detailsButton}
                  onPress={() => openDetail(item)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.detailsButtonText}>VER DETALLES</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* MODAL FILTROS */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={filterModalVisible}
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.filterModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtrar Parqueaderos</Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setFilterModalVisible(false)}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <Text style={styles.filterGroupTitle}>TIPO DE VEHÍCULO</Text>
            <View style={styles.filterOptionsGrid}>
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'motos', label: 'Motos' },
                { id: 'carros', label: 'Carros' },
                { id: 'camiones', label: 'Camiones' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.filterChip,
                    vehicleFilter === opt.id && styles.filterChipActive,
                  ]}
                  onPress={() => setVehicleFilter(opt.id)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      vehicleFilter === opt.id && styles.filterChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.filterGroupTitle, { marginTop: 16 }]}>DISPONIBILIDAD</Text>
            <TouchableOpacity
              style={[styles.toggleRow, onlyAvailable && styles.toggleRowActive]}
              onPress={() => setOnlyAvailable(!onlyAvailable)}
            >
              <Ionicons
                name={onlyAvailable ? 'checkbox' : 'square-outline'}
                size={22}
                color={onlyAvailable ? '#FFD200' : '#8E8E93'}
              />
              <Text style={styles.toggleText}>Solo con celdas disponibles</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.applyFilterBtn}
              onPress={() => setFilterModalVisible(false)}
            >
              <Text style={styles.applyFilterBtnText}>APLICAR</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL PERFIL / CERRAR SESIÓN */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={profileModalVisible}
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.filterModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mi Perfil</Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setProfileModalVisible(false)}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.profileInfoBox}>
              <View style={styles.profileAvatar}>
                <Ionicons name="person" size={32} color="#000000" />
              </View>
              <Text style={styles.profileName}>{userName || 'Cliente'}</Text>
              <Text style={styles.profileEmail}>{userEmail}</Text>
              <View style={styles.profileRoleBadge}>
                <Text style={styles.profileRoleText}>CLIENTE</Text>
              </View>
              {homeCity && (
                <View style={styles.profileCityRow}>
                  <Ionicons name="location-outline" size={14} color="#8E8E93" />
                  <Text style={styles.profileEmail}>{homeCity.nombre}</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.8}
            >
              <Ionicons name="exit-outline" size={20} color="#FF5252" style={{ marginRight: 8 }} />
              <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <CityPickerModal
        visible={cityPickerVisible}
        selected={homeCity?.nombre}
        onSelect={changeHomeCity}
        onClose={() => setCityPickerVisible(false)}
      />
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
    paddingTop: 12,
    paddingBottom: 8,
  },
  parkappBadge: {
    borderWidth: 1,
    borderColor: '#FFD200',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  parkappText: {
    color: '#FFD200',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  profileBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  contentTablet: {
    paddingHorizontal: 40,
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
    marginBottom: 12,
  },
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: '#1F1F10',
    borderWidth: 0.5,
    borderColor: '#3D3D20',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
  },
  cityChipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  cityChipAction: {
    color: '#FFD200',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },

  // Search & Filter
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  searchInputContainer: {
    flex: 1,
    height: 48,
    backgroundColor: '#161618',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262628',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFD200',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonActive: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  // Section Header
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8E8E93',
    letterSpacing: 0.8,
  },
  clearFilterText: {
    fontSize: 12,
    color: '#FFD200',
    fontWeight: '600',
  },

  // Card
  card: {
    backgroundColor: '#161618',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#262628',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 10,
  },
  distanceBadge: {
    backgroundColor: '#1F1F10',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#3D3D20',
  },
  distanceText: {
    color: '#FFD200',
    fontWeight: 'bold',
    fontSize: 11,
  },
  cardAddress: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 14,
  },

  // Availability Pills
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F11',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#262628',
  },
  pillWarning: {
    borderColor: '#FFD200',
  },
  pillNumber: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
    marginLeft: 5,
  },
  pillLabel: {
    color: '#8E8E93',
    fontSize: 11,
    marginLeft: 2,
  },

  // Details button
  detailsButton: {
    backgroundColor: '#1E1E22',
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2E2E34',
  },
  detailsButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#8E8E93',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#5A5A5E',
    marginTop: 6,
    textAlign: 'center',
  },

  // Modals generic
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#262628',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Filter Modal
  filterModalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#161618',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  filterGroupTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E8E93',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  filterOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#0F0F11',
    borderWidth: 1,
    borderColor: '#262628',
  },
  filterChipActive: {
    backgroundColor: '#FFD200',
    borderColor: '#FFD200',
  },
  filterChipText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  filterChipTextActive: {
    color: '#000000',
    fontWeight: 'bold',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  toggleRowActive: {},
  toggleText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  applyFilterBtn: {
    backgroundColor: '#FFD200',
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  applyFilterBtnText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 0.8,
  },

  // Profile Modal
  profileInfoBox: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFD200',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  profileEmail: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 4,
  },
  profileRoleBadge: {
    backgroundColor: '#1E1E14',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 10,
    borderWidth: 0.5,
    borderColor: '#3D3D20',
  },
  profileCityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  profileRoleText: {
    color: '#FFD200',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
  logoutButton: {
    backgroundColor: '#262628',
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A3A3C',
    marginTop: 10,
  },
  logoutButtonText: {
    color: '#FF5252',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default ClientHomeScreen;
