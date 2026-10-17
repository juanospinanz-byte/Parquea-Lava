import React, { useEffect, useState, useMemo } from 'react';
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
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

const ClientHomeScreen = ({ navigation, route }) => {
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [parqueaderos, setParqueaderos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState(DEFAULT_USER_COORDS);

  // Modals state
  const [selectedParqueadero, setSelectedParqueadero] = useState(null);
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
    fetchParqueaderos();
    requestUserLocation();
  }, []);

  const requestUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
    } catch (e) {
      // Keep default Bogotá coords
    }
  };

  const fetchParqueaderos = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/parqueadero/todos');
      setParqueaderos(response.data);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudieron cargar los parqueaderos');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setProfileModalVisible(false);
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('userData');
    navigation.replace('Login');
  };

  // Open location in external Maps app
  const openExternalMaps = (parqueadero) => {
    if (!parqueadero.latitud || !parqueadero.longitud) {
      Alert.alert('Sin coordenadas', 'Este parqueadero aún no tiene coordenadas GPS registradas.');
      return;
    }
    const lat = parseFloat(parqueadero.latitud);
    const lng = parseFloat(parqueadero.longitud);
    const label = encodeURIComponent(parqueadero.nombre || 'Parqueadero');
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`);
    });
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
        if (onlyAvailable) {
          const totalDisp = (item.motos_disponibles || 0) + (item.carros_disponibles || 0) + (item.camiones_disponibles || 0);
          if (totalDisp <= 0) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.calculatedDistance !== null && b.calculatedDistance !== null) {
          return a.calculatedDistance - b.calculatedDistance;
        }
        return 0;
      });
  }, [parqueaderos, searchQuery, vehicleFilter, onlyAvailable, userLocation]);

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
                  onPress={() => setSelectedParqueadero(item)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.detailsButtonText}>VER DETALLES</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* MODAL DETALLES DEL PARQUEADERO */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={!!selectedParqueadero}
        onRequestClose={() => setSelectedParqueadero(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailModalContent}>
            {selectedParqueadero && (
              <>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle} numberOfLines={1}>
                      {selectedParqueadero.nombre || 'Parqueadero'}
                    </Text>
                    <Text style={styles.modalSubtitle}>Detalles y Ubicación</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={() => setSelectedParqueadero(null)}
                  >
                    <Ionicons name="close" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
                  {/* Map Preview */}
                  {selectedParqueadero.latitud && selectedParqueadero.longitud ? (
                    <View style={styles.detailMapContainer}>
                      <MapView
                        style={styles.detailMap}
                        initialRegion={{
                          latitude: parseFloat(selectedParqueadero.latitud),
                          longitude: parseFloat(selectedParqueadero.longitud),
                          latitudeDelta: 0.006,
                          longitudeDelta: 0.006,
                        }}
                        scrollEnabled={false}
                        zoomEnabled={false}
                      >
                        <Marker
                          coordinate={{
                            latitude: parseFloat(selectedParqueadero.latitud),
                            longitude: parseFloat(selectedParqueadero.longitud),
                          }}
                          title={selectedParqueadero.nombre}
                          description={selectedParqueadero.direccion}
                        >
                          <View style={styles.mapMarker}>
                            <Ionicons name="car-sport" size={16} color="#000" />
                          </View>
                        </Marker>
                      </MapView>
                      <View style={styles.mapDistanceBadge}>
                        <Ionicons name="navigate" size={12} color="#FFD200" />
                        <Text style={styles.mapDistanceText}>
                          {selectedParqueadero.distanceText}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Address & Details Box */}
                  <View style={styles.detailSectionBox}>
                    <View style={styles.detailAddressRow}>
                      <Ionicons name="location" size={20} color="#FFD200" style={{ marginRight: 10, marginTop: 2 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.detailSectionLabel}>DIRECCIÓN FÍSICA</Text>
                        <Text style={styles.detailAddressText}>
                          {selectedParqueadero.direccion || 'Sin dirección registrada'}
                        </Text>
                      </View>
                    </View>

                    {selectedParqueadero.detalles_ubicacion ? (
                      <View style={[styles.detailAddressRow, { marginTop: 12 }]}>
                        <Ionicons name="information-circle-outline" size={20} color="#FFD200" style={{ marginRight: 10, marginTop: 2 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.detailSectionLabel}>DETALLES ADICIONALES</Text>
                          <Text style={styles.detailDetailsText}>
                            {selectedParqueadero.detalles_ubicacion}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </View>

                  {/* Cell Availability Breakdown */}
                  <Text style={styles.detailSectionHeader}>DISPONIBILIDAD DE CELDAS</Text>
                  <View style={styles.detailGrid}>
                    {/* Motos */}
                    <View style={styles.detailGridItem}>
                      <MaterialCommunityIcons name="motorbike" size={22} color="#FFD200" />
                      <Text style={styles.detailGridNumber}>
                        {selectedParqueadero.motos_disponibles || 0}
                      </Text>
                      <Text style={styles.detailGridCap}>
                        de {selectedParqueadero.motos_max || 0} máx.
                      </Text>
                      <Text style={styles.detailGridLabel}>Motos</Text>
                    </View>

                    {/* Carros */}
                    <View style={styles.detailGridItem}>
                      <Ionicons name="car-sport" size={22} color="#FFD200" />
                      <Text style={styles.detailGridNumber}>
                        {selectedParqueadero.carros_disponibles || 0}
                      </Text>
                      <Text style={styles.detailGridCap}>
                        de {selectedParqueadero.carros_max || 0} máx.
                      </Text>
                      <Text style={styles.detailGridLabel}>Carros</Text>
                    </View>

                    {/* Camiones */}
                    <View style={styles.detailGridItem}>
                      <MaterialCommunityIcons name="truck-outline" size={22} color="#FFD200" />
                      <Text style={styles.detailGridNumber}>
                        {selectedParqueadero.camiones_disponibles || 0}
                      </Text>
                      <Text style={styles.detailGridCap}>
                        de {selectedParqueadero.camiones_max || 0} máx.
                      </Text>
                      <Text style={styles.detailGridLabel}>Camiones</Text>
                    </View>
                  </View>

                  {/* Price per Hour Breakdown */}
                  <Text style={styles.detailSectionHeader}>PRECIO POR HORA</Text>
                  <View style={styles.priceRow}>
                    <View style={styles.priceCard}>
                      <Text style={styles.priceVehicle}>🏍 Moto</Text>
                      <Text style={styles.priceValue}>
                        ${parseFloat(selectedParqueadero.motos_precio || 0).toLocaleString()}
                      </Text>
                      <Text style={styles.priceUnit}>por hora</Text>
                    </View>

                    <View style={styles.priceCard}>
                      <Text style={styles.priceVehicle}>🚗 Carro</Text>
                      <Text style={styles.priceValue}>
                        ${parseFloat(selectedParqueadero.carros_precio || 0).toLocaleString()}
                      </Text>
                      <Text style={styles.priceUnit}>por hora</Text>
                    </View>

                    <View style={styles.priceCard}>
                      <Text style={styles.priceVehicle}>🚛 Camión</Text>
                      <Text style={styles.priceValue}>
                        ${parseFloat(selectedParqueadero.camiones_precio || 0).toLocaleString()}
                      </Text>
                      <Text style={styles.priceUnit}>por hora</Text>
                    </View>
                  </View>
                </ScrollView>

                {/* Actions: Navigate */}
                <TouchableOpacity
                  style={styles.navigateButton}
                  onPress={() => openExternalMaps(selectedParqueadero)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="navigate" size={18} color="#000000" style={{ marginRight: 8 }} />
                  <Text style={styles.navigateButtonText}>CÓMO LLEGAR</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

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
  detailModalContent: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#161618',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
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

  // Map inside modal
  detailMapContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    height: 160,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  detailMap: {
    width: '100%',
    height: '100%',
  },
  mapMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFD200',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000',
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

  // Detail Section
  detailSectionBox: {
    backgroundColor: '#0F0F11',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#262628',
  },
  detailAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  detailSectionLabel: {
    fontSize: 10,
    color: '#8E8E93',
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailAddressText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  detailDetailsText: {
    fontSize: 13,
    color: '#CCCCCC',
  },
  detailSectionHeader: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#8E8E93',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // Grid
  detailGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  detailGridItem: {
    flex: 1,
    backgroundColor: '#0F0F11',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262628',
  },
  detailGridNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 4,
  },
  detailGridCap: {
    fontSize: 10,
    color: '#666668',
    marginTop: 1,
  },
  detailGridLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },

  // Prices
  priceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  priceCard: {
    flex: 1,
    backgroundColor: '#0F0F11',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262628',
  },
  priceVehicle: {
    fontSize: 11,
    color: '#8E8E93',
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFD200',
  },
  priceUnit: {
    fontSize: 10,
    color: '#666668',
    marginTop: 2,
  },

  // Navigate Button
  navigateButton: {
    backgroundColor: '#FFD200',
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navigateButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.8,
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
