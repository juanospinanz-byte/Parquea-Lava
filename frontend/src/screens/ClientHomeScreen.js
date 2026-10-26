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
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import api from '../services/api';
import useResponsive from '../hooks/useResponsive';

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

const formatPrice = (value) => `$${parseFloat(value || 0).toLocaleString()}`;

const getTotalDisponibles = (item) =>
  (item.motos_disponibles || 0) + (item.carros_disponibles || 0) + (item.camiones_disponibles || 0);

// US05: cada cuánto se refresca la lista/mapa mientras la pantalla está visible
const REFRESH_INTERVAL_MS = 10000;

const ClientHomeScreen = ({ navigation, route }) => {
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [parqueaderos, setParqueaderos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState(DEFAULT_USER_COORDS);

  // US05: parqueadero seleccionado en el mapa
  const [mapSelectedId, setMapSelectedId] = useState(null);
  const mapRef = useRef(null);

  // Modals state
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  // Filter state
  const [vehicleFilter, setVehicleFilter] = useState('todos'); // 'todos', 'motos', 'carros', 'camiones'
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const { isTablet } = useResponsive();

  useEffect(() => {
    const getUserData = async () => {
      if (route.params?.user?.nombre) {
        setUserName(route.params.user.nombre);
        setUserEmail(route.params.user.correo || '');
      } else {
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          setUserName(userData.nombre);
          setUserEmail(userData.correo || '');
        }
      }
    };
    getUserData();
    requestUserLocation();
  }, []);

  // Refresca al volver a la pantalla y periódicamente para mantener la disponibilidad al día
  useFocusEffect(
    useCallback(() => {
      fetchParqueaderos();
      const interval = setInterval(() => fetchParqueaderos(true), REFRESH_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [])
  );

  const centerMapOn = (coords) => {
    mapRef.current?.animateToRegion(
      { ...coords, latitudeDelta: 0.04, longitudeDelta: 0.04 },
      800
    );
  };

  const requestUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setUserLocation(coords);
        centerMapOn(coords);
      }
    } catch (e) {
      // Keep default Bogotá coords
    }
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
    return parqueaderos
      .map((item, index) => {
        let distanceKm = null;
        if (item.latitud && item.longitud && userLocation) {
          distanceKm = calculateDistanceKm(
            userLocation.latitude,
            userLocation.longitude,
            parseFloat(item.latitud),
            parseFloat(item.longitud)
          );
        }
        return {
          ...item,
          calculatedDistance: distanceKm,
          distanceText: formatDistance(distanceKm, index),
        };
      })
      .filter((item) => {
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
  }, [parqueaderos, searchQuery, vehicleFilter, onlyAvailable, userLocation]);

  // US05: solo los parqueaderos con coordenadas pueden ubicarse en el mapa
  const mapParqueaderos = filteredParqueaderos.filter((item) => item.latitud && item.longitud);
  const mapSelected = mapParqueaderos.find((item) => item.id === mapSelectedId);

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
        <Text style={styles.subtitle}>Encuentra espacios disponibles cerca de ti</Text>

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

        {/* US05: Mapa de parqueaderos cercanos */}
        <Text style={[styles.sectionTitle, { marginBottom: 14 }]}>MAPA DE PARQUEADEROS</Text>
        <View style={styles.mapCard}>
          <View style={[styles.mapContainer, isTablet && styles.mapContainerTablet]}>
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={{
                ...userLocation,
                latitudeDelta: 0.04,
                longitudeDelta: 0.04,
              }}
              showsUserLocation
              showsMyLocationButton={false}
              toolbarEnabled={false}
              onPress={(e) => {
                // En Android tocar un marcador también dispara el onPress del mapa
                if (e.nativeEvent.action !== 'marker-press') setMapSelectedId(null);
              }}
            >
              {mapParqueaderos.map((item) => {
                const isSelected = item.id === mapSelectedId;
                const total = getTotalDisponibles(item);
                return (
                  <Marker
                    key={item.id}
                    coordinate={{
                      latitude: parseFloat(item.latitud),
                      longitude: parseFloat(item.longitud),
                    }}
                    onPress={() => setMapSelectedId(item.id)}
                  >
                    <View
                      style={[
                        styles.mapMarker,
                        total === 0 && styles.mapMarkerFull,
                        isSelected && styles.mapMarkerSelected,
                      ]}
                    >
                      <MaterialCommunityIcons name="parking" size={14} color="#000000" />
                      <Text style={styles.mapMarkerText}>{total}</Text>
                    </View>
                  </Marker>
                );
              })}
            </MapView>

            <TouchableOpacity
              style={styles.locateButton}
              onPress={() => centerMapOn(userLocation)}
              activeOpacity={0.8}
            >
              <Ionicons name="locate" size={20} color="#000000" />
            </TouchableOpacity>

            {!loading && mapParqueaderos.length === 0 && (
              <View style={styles.mapEmptyBadge}>
                <Text style={styles.mapEmptyText}>Sin parqueaderos ubicados en el mapa</Text>
              </View>
            )}
          </View>

          {/* Información clave del parqueadero seleccionado en el mapa */}
          {mapSelected ? (
            <View style={styles.mapPreview}>
              <View style={styles.cardTopRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {mapSelected.nombre || 'Parqueadero'}
                </Text>
                <View style={styles.distanceBadge}>
                  <Text style={styles.distanceText}>{mapSelected.distanceText}</Text>
                </View>
              </View>

              <View style={styles.mapPreviewAddressRow}>
                <Ionicons name="location-outline" size={14} color="#FFD200" />
                <Text style={styles.mapPreviewAddress} numberOfLines={1}>
                  {mapSelected.direccion || 'Sin dirección registrada'}
                </Text>
              </View>

              <View style={styles.mapPreviewGrid}>
                {[
                  { key: 'motos', label: 'Moto', icon: <MaterialCommunityIcons name="motorbike" size={16} color="#FFD200" /> },
                  { key: 'carros', label: 'Carro', icon: <Ionicons name="car-sport" size={16} color="#FFD200" /> },
                  { key: 'camiones', label: 'Camión', icon: <MaterialCommunityIcons name="truck-outline" size={16} color="#FFD200" /> },
                ].map(({ key, label, icon }) => (
                  <View key={key} style={styles.mapPreviewItem}>
                    {icon}
                    <Text style={styles.mapPreviewCount}>
                      {mapSelected[`${key}_disponibles`] || 0}
                      <Text style={styles.mapPreviewLabel}> {label}</Text>
                    </Text>
                    <Text style={styles.mapPreviewPrice}>
                      {formatPrice(mapSelected[`${key}_precio`])}/h
                    </Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={styles.detailsButton}
                onPress={() => openDetail(mapSelected)}
                activeOpacity={0.8}
              >
                <Text style={styles.detailsButtonText}>VER DETALLES</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.mapHint}>
              Toca un marcador para ver disponibilidad y precio por hora
            </Text>
          )}
        </View>

        {/* Section Title */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>RESULTADOS CERCANOS</Text>
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
            <Text style={styles.emptyTitle}>No se encontraron parqueaderos</Text>
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
    marginBottom: 20,
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

  // US05: Mapa
  mapCard: {
    backgroundColor: '#161618',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#262628',
    overflow: 'hidden',
    marginBottom: 24,
  },
  mapContainer: {
    height: 220,
  },
  mapContainerTablet: {
    height: 340,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapMarker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD200',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#000000',
    gap: 2,
  },
  mapMarkerFull: {
    backgroundColor: '#8E8E93',
  },
  mapMarkerSelected: {
    backgroundColor: '#FFFFFF',
  },
  mapMarkerText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 12,
  },
  locateButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFD200',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  mapEmptyBadge: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  mapEmptyText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  mapHint: {
    color: '#8E8E93',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  mapPreview: {
    padding: 16,
  },
  mapPreviewAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  mapPreviewAddress: {
    flex: 1,
    fontSize: 13,
    color: '#8E8E93',
  },
  mapPreviewGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  mapPreviewItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#0F0F11',
    borderRadius: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#262628',
  },
  mapPreviewCount: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
    marginTop: 4,
  },
  mapPreviewLabel: {
    color: '#8E8E93',
    fontWeight: 'normal',
    fontSize: 11,
  },
  mapPreviewPrice: {
    color: '#FFD200',
    fontWeight: 'bold',
    fontSize: 12,
    marginTop: 2,
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
