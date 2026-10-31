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
import useRealtime from '../hooks/useRealtime';
import ParkingMap from '../components/ParkingMap';
import { logout } from '../services/session';
import { hasValidCoords } from '../utils/maps';
import { VEHICLE_SINGULAR, withLocalExpiry, formatClock } from '../utils/reservas';
import { estaAbiertoAhora, formatRating, tieneLavado } from '../utils/parqueadero';
import { scheduleReservaReminder, cancelReservaReminder } from '../utils/notifications';
import { findCity } from '../constants/cities';
import CityPickerModal from '../components/CityPickerModal';
import AppHeader from '../components/AppHeader';
import { colors } from '../theme';

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

// Format distance string like "A 200m" or "A 1.2km"; null si no se conoce la ubicación
const formatDistance = (km) => {
  if (km === null || km === undefined) return null;
  if (km < 1) {
    const meters = Math.round(km * 1000);
    return `A ${meters}m`;
  }
  return `A ${km.toFixed(1)}km`;
};

// Pastillas de disponibilidad en cada tarjeta
const PILL_TYPES = [
  { key: 'motos', label: 'Moto', icon: 'motorbike', IconSet: MaterialCommunityIcons },
  { key: 'carros', label: 'Carro', icon: 'car-sport', IconSet: Ionicons },
  { key: 'camiones', label: 'Camión', icon: 'truck-outline', IconSet: MaterialCommunityIcons },
];

const getTotalDisponibles = (item) =>
  (item.motos_disponibles || 0) + (item.carros_disponibles || 0) + (item.camiones_disponibles || 0);

// US05: cada cuánto se refresca la lista mientras la pantalla está visible
// Los cambios llegan al instante por tiempo real; esto es un respaldo por si se cae la conexión
const REFRESH_INTERVAL_MS = 30000;

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
  const [miReserva, setMiReserva] = useState(null);
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
  const [viewMode, setViewMode] = useState('lista'); // 'lista' o 'mapa'

  const { isTablet } = useResponsive();

  // Se relee al volver a la pantalla, por si el nombre se cambió en Mi Perfil
  useFocusEffect(
    useCallback(() => {
      const getUserData = async () => {
        let userData = null;
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) userData = JSON.parse(userDataStr);
        if (!userData && route.params?.user?.nombre) userData = route.params.user;
        if (userData) {
          setUserName(userData.nombre);
          setUserEmail(userData.correo || '');
          setHomeCity(findCity(userData.ciudad));
        }
      };
      getUserData();
    }, [])
  );

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

  // Tiempo real: disponibilidad, horarios y reservas cambian al instante en la lista y el mapa
  useRealtime('parqueadero:actualizado', () => fetchParqueaderos(true));
  useRealtime('reservas:actualizadas', () => fetchParqueaderos(true));

  // Recordatorio 5 minutos antes de que venza la reserva (se quita si ya no hay reserva)
  useEffect(() => {
    if (miReserva) scheduleReservaReminder(miReserva);
    else cancelReservaReminder();
  }, [miReserva]);

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
      const [response, reservaResponse] = await Promise.all([
        api.get('/api/parqueadero/todos'),
        api.get('/api/reservas/mia').catch(() => null),
      ]);
      setParqueaderos(response.data);
      if (reservaResponse) setMiReserva(withLocalExpiry(reservaResponse.data || null));
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
    await logout(navigation);
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
      .map((item) => {
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
          distanceText: formatDistance(distanceKm),
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
        if (onlyAvailable && (getTotalDisponibles(item) <= 0 || !estaAbiertoAhora(item))) return false;

        return true;
      })
      .sort((a, b) => {
        if (a.calculatedDistance !== null && b.calculatedDistance !== null) {
          return a.calculatedDistance - b.calculatedDistance;
        }
        return 0;
      });
  }, [parqueaderos, searchQuery, vehicleFilter, onlyAvailable, userLocation, hasRealLocation, homeCity]);

  // Pines del mapa: número de celdas libres; rojo si está lleno o cerrado
  const mapMarkers = useMemo(
    () =>
      filteredParqueaderos.filter(hasValidCoords).map((item) => {
        const libres = getTotalDisponibles(item);
        const abierto = estaAbiertoAhora(item);
        const rating = formatRating(item);
        return {
          id: item.id,
          latitude: parseFloat(item.latitud),
          longitude: parseFloat(item.longitud),
          label: String(libres),
          available: abierto && libres > 0,
          title: item.nombre || 'Parqueadero',
          subtitle: `${abierto ? `${libres} celdas libres` : 'Cerrado ahora'}${rating ? ` · ★ ${rating}` : ''}${
            item.distanceText ? ` · ${item.distanceText}` : ''
          }`,
        };
      }),
    [filteredParqueaderos]
  );

  // Nombre de la ciudad que se está mostrando
  const shownCityName = homeCity?.nombre || userCity;
  const showingCity = !!(homeCity || hasRealLocation) && !searchQuery.trim();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <AppHeader onProfilePress={() => setProfileModalVisible(true)} />

      <ScrollView
        contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
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

        {/* Reserva activa: toca para ver el detalle y la cuenta regresiva */}
        {miReserva ? (
          <TouchableOpacity
            style={styles.reservaBanner}
            onPress={() => navigation.navigate('ParkingDetail', { parqueaderoId: miReserva.parqueadero_id })}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="ticket-confirmation-outline" size={24} color={colors.onPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.reservaBannerTitle} numberOfLines={1}>
                Reserva en {miReserva.parqueadero_nombre || 'parqueadero'}
              </Text>
              <Text style={styles.reservaBannerText}>
                {VEHICLE_SINGULAR[miReserva.tipo_vehiculo]} · {miReserva.placa} · vence a las{' '}
                {formatClock(miReserva.expiraLocal)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.onPrimary} />
          </TouchableOpacity>
        ) : null}

        {/* Ciudad del cliente: toca para cambiarla */}
        <TouchableOpacity
          style={styles.cityChip}
          onPress={() => setCityPickerVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="location" size={16} color={colors.primary} />
          <Text style={styles.cityChipText}>{homeCity ? homeCity.nombre : 'Elige tu ciudad'}</Text>
          <Text style={styles.cityChipAction}>Cambiar</Text>
        </TouchableOpacity>

        {/* Search & Filter Bar */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por ubicación..."
              placeholderTextColor={colors.placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
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
            <Ionicons name="options" size={22} color={colors.onPrimary} />
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

        {/* Lista o mapa */}
        <View style={styles.viewToggle}>
          {[
            { id: 'lista', label: 'LISTA', icon: 'list' },
            { id: 'mapa', label: 'MAPA', icon: 'map' },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[styles.viewToggleBtn, viewMode === opt.id && styles.viewToggleBtnActive]}
              onPress={() => setViewMode(opt.id)}
              activeOpacity={0.8}
            >
              <Ionicons name={opt.icon} size={16} color={viewMode === opt.id ? colors.onPrimary : colors.primary} />
              <Text style={[styles.viewToggleText, viewMode === opt.id && styles.viewToggleTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Parking Lot Cards */}
        {viewMode === 'mapa' ? (
          <>
            <ParkingMap
              style={styles.map}
              markers={mapMarkers}
              userLocation={hasRealLocation ? userLocation : null}
              center={homeCity || userLocation}
              onSelect={(id) => {
                const item = filteredParqueaderos.find((p) => p.id === id);
                if (item) openDetail(item);
              }}
            />
            <Text style={styles.mapHint}>
              El número de cada pin son las celdas libres. Rojo: lleno o cerrado. Toca un pin para ver el parqueadero.
            </Text>
          </>
        ) : loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 30 }} />
        ) : filteredParqueaderos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="car-outline" size={48} color={colors.borderStrong} />
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
          filteredParqueaderos.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.card, !estaAbiertoAhora(item) && styles.cardClosed]}
                onPress={() => openDetail(item)}
                activeOpacity={0.85}
              >
                {/* Header: Name and Distance Badge */}
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.nombre || 'Parqueadero'}
                  </Text>
                  {!estaAbiertoAhora(item) ? (
                    <View style={styles.closedBadge}>
                      <Text style={styles.closedBadgeText}>CERRADO</Text>
                    </View>
                  ) : null}
                  {item.distanceText ? (
                    <View style={styles.distanceBadge}>
                      <Text style={styles.distanceText}>{item.distanceText}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Physical Address */}
                <Text style={styles.cardAddress} numberOfLines={1}>
                  {item.direccion || 'Sin dirección registrada'}
                </Text>

                {/* Calificación y lavado */}
                {formatRating(item) || tieneLavado(item) ? (
                  <View style={styles.badgesRow}>
                    {formatRating(item) ? (
                      <View style={styles.infoBadge}>
                        <Ionicons name="star" size={12} color={colors.primary} />
                        <Text style={styles.infoBadgeText}>{formatRating(item)}</Text>
                      </View>
                    ) : null}
                    {tieneLavado(item) ? (
                      <View style={styles.infoBadge}>
                        <MaterialCommunityIcons name="car-wash" size={13} color={colors.primary} />
                        <Text style={styles.infoBadgeText}>Lavado</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Celdas libres por tipo: amarillo si quedan pocas, apagado si no hay */}
                <View style={styles.pillsRow}>
                  {PILL_TYPES.map(({ key, label, icon, IconSet }) => {
                    const libres = item[`${key}_disponibles`] || 0;
                    const pocas = libres > 0 && libres <= 2;
                    return (
                      <View
                        key={key}
                        style={[styles.pill, pocas && styles.pillWarning, libres === 0 && styles.pillEmpty]}
                      >
                        <IconSet name={icon} size={14} color={pocas ? colors.primary : colors.textMuted} />
                        <Text style={[styles.pillNumber, pocas && { color: colors.primary }]}>{libres}</Text>
                        <Text style={styles.pillLabel} numberOfLines={1}>
                          {label}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.detailsRow}>
                  <Text style={styles.detailsButtonText}>Ver detalles y reservar</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </View>
              </TouchableOpacity>
            ))
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
                <Ionicons name="close" size={20} color={colors.text} />
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
                color={onlyAvailable ? colors.primary : colors.textMuted}
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
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.profileInfoBox}>
              <View style={styles.profileAvatar}>
                <Ionicons name="person" size={32} color={colors.onPrimary} />
              </View>
              <Text style={styles.profileName}>{userName || 'Cliente'}</Text>
              <Text style={styles.profileEmail}>{userEmail}</Text>
              <View style={styles.profileRoleBadge}>
                <Text style={styles.profileRoleText}>CLIENTE</Text>
              </View>
              {homeCity && (
                <View style={styles.profileCityRow}>
                  <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.profileEmail}>{homeCity.nombre}</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.changePasswordButton}
              onPress={() => {
                setProfileModalVisible(false);
                navigation.navigate('History');
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="receipt-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.changePasswordButtonText}>Mis Reservas</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.changePasswordButton}
              onPress={() => {
                setProfileModalVisible(false);
                navigation.navigate('Profile');
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="person-circle-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.changePasswordButtonText}>Editar Perfil y Contraseña</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.8}
            >
              <Ionicons name="exit-outline" size={20} color={colors.danger} style={{ marginRight: 8 }} />
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
    backgroundColor: colors.bg,
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
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 12,
  },
  reservaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  reservaBannerTitle: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  reservaBannerText: {
    color: colors.surfaceRaised,
    fontSize: 12,
    marginTop: 2,
  },
  cityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: colors.primarySoft,
    borderWidth: 0.5,
    borderColor: colors.primaryBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
  },
  cityChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: 'bold',
  },
  cityChipAction: {
    color: colors.primary,
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
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterButtonActive: {
    borderWidth: 2,
    borderColor: colors.white,
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
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  clearFilterText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewToggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  viewToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
  },
  viewToggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  viewToggleText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
  viewToggleTextActive: {
    color: colors.onPrimary,
  },
  map: {
    height: 440,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapHint: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  infoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  infoBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: 'bold',
  },
  cardClosed: {
    opacity: 0.6,
  },
  closedBadge: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 0.5,
    borderColor: colors.danger,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
  },
  closedBadgeText: {
    color: colors.danger,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
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
    color: colors.text,
    flex: 1,
    marginRight: 10,
  },
  distanceBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: colors.primaryBorder,
  },
  distanceText: {
    color: colors.primary,
    fontWeight: 'bold',
    fontSize: 11,
  },
  cardAddress: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 14,
  },

  // Availability Pills
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillWarning: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  pillEmpty: {
    opacity: 0.4,
  },
  pillNumber: {
    color: colors.text,
    fontWeight: 'bold',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  pillLabel: {
    flexShrink: 1,
    color: colors.textMuted,
    fontSize: 11,
  },

  // Pie de la tarjeta: invita a abrir el detalle
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailsButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: 'bold',
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
    color: colors.textMuted,
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textFaint,
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
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Filter Modal
  filterModalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterGroupTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.textMuted,
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
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.text,
    fontSize: 13,
  },
  filterChipTextActive: {
    color: colors.onPrimary,
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
    color: colors.text,
    fontSize: 14,
  },
  applyFilterBtn: {
    backgroundColor: colors.primary,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  applyFilterBtnText: {
    color: colors.onPrimary,
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
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  profileEmail: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 4,
  },
  profileRoleBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 10,
    borderWidth: 0.5,
    borderColor: colors.primaryBorder,
  },
  profileCityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  profileRoleText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
  changePasswordButton: {
    backgroundColor: colors.primarySoft,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    marginTop: 10,
  },
  changePasswordButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  logoutButton: {
    backgroundColor: colors.surfaceHigh,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginTop: 10,
  },
  logoutButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default ClientHomeScreen;
