import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../services/api';
import useResponsive from '../hooks/useResponsive';
import { hasValidCoords, openInMaps } from '../utils/maps';
import { VEHICLE_SINGULAR, withLocalExpiry, formatClock, getErrorMessage } from '../utils/reservas';

// Cada cuánto se revisan reservas nuevas y la disponibilidad mientras la pantalla está abierta
const REFRESH_INTERVAL_MS = 10000;

const VEHICLE_TYPES = [
  { key: 'motos', label: 'Motos', icon: 'motorbike', IconSet: MaterialCommunityIcons },
  { key: 'carros', label: 'Carros', icon: 'car-sport', IconSet: Ionicons },
  { key: 'camiones', label: 'Camiones', icon: 'truck-outline', IconSet: MaterialCommunityIcons },
];

const formatPrice = (value) => `$${parseFloat(value || 0).toLocaleString()}`;

// Convierte lo escrito en el formulario a número (vacío = 0); NaN si no es un número válido
const toNumber = (text) => (text.trim() === '' ? 0 : Number(text.trim()));

const OwnerHomeScreen = ({ navigation, route }) => {
  const [userName, setUserName] = useState('');
  const [parqueadero, setParqueadero] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reservas, setReservas] = useState([]);
  // Reserva con una acción (llegó / no llegó) en curso
  const [reservaBusyId, setReservaBusyId] = useState(null);
  const { isTablet, isWideLayout } = useResponsive();
  const tabletPadding = isTablet && styles.tabletPadding;
  // Tipos de vehículo con un cambio de +/− en curso (evita toques dobles con datos viejos)
  const adjustingRef = useRef({});

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingType, setEditingType] = useState(null); // 'motos', 'carros', 'camiones', 'nombre'
  const [savingModal, setSavingModal] = useState(false);

  // Edit Form State
  const [editDisponibles, setEditDisponibles] = useState('');
  const [editMax, setEditMax] = useState('');
  const [editPrecio, setEditPrecio] = useState('');
  const [editNombre, setEditNombre] = useState('');

  useEffect(() => {
    const getUserData = async () => {
      let name = '';
      if (route.params?.user?.nombre) {
        name = route.params.user.nombre;
      } else {
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          name = userData.nombre;
        }
      }
      setUserName(name);
    };
    getUserData();
  }, []);

  // Se consulta al entrar, al volver a la pantalla y cada pocos segundos para ver reservas nuevas
  // (sin taparla con el indicador de carga)
  useFocusEffect(
    React.useCallback(() => {
      const refresh = () => {
        fetchParqueadero();
        fetchReservas();
      };
      refresh();
      const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [])
  );

  const fetchReservas = async () => {
    try {
      const response = await api.get('/api/reservas/parqueadero');
      setReservas(response.data.map(withLocalExpiry));
    } catch (error) {
      console.error(error);
    }
  };

  // Devuelve true si se pudo cargar
  const fetchParqueadero = async () => {
    try {
      const response = await api.get('/api/parqueadero/me');
      setParqueadero(response.data);
      return true;
    } catch (error) {
      console.error(error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const retryLoad = () => {
    setLoading(true);
    fetchParqueadero();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const [ok] = await Promise.all([fetchParqueadero(), fetchReservas()]);
    setRefreshing(false);
    if (!ok) Alert.alert('Sin conexión', 'No se pudo actualizar la información del parqueadero');
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('userData');
    navigation.replace('Login');
  };

  const confirmLogout = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: handleLogout },
    ]);
  };

  // Registro rápido: − cuando entra un vehículo, + cuando sale
  const adjustDisponibles = async (type, delta) => {
    if (adjustingRef.current[type]) return;

    const field = `${type}_disponibles`;
    const current = parqueadero[field] || 0;
    const next = current + delta;
    if (next < 0 || next > (parqueadero[`${type}_max`] || 0)) return;

    adjustingRef.current[type] = true;
    // Se muestra el cambio al instante y se revierte si el servidor falla
    setParqueadero((p) => ({ ...p, [field]: next }));
    try {
      const response = await api.put('/api/parqueadero/me', { [field]: next });
      setParqueadero(response.data);
    } catch (error) {
      console.error(error);
      setParqueadero((p) => ({ ...p, [field]: current }));
      Alert.alert('Error', getErrorMessage(error, 'No se pudo actualizar la disponibilidad'));
    } finally {
      adjustingRef.current[type] = false;
    }
  };

  // action: 'completar' (el vehículo llegó) o 'cancelar' (no llegó: la celda vuelve a quedar libre)
  const closeReserva = async (reserva, action) => {
    try {
      setReservaBusyId(reserva.id);
      await api.put(`/api/reservas/${reserva.id}/${action}`);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', getErrorMessage(error, 'No se pudo actualizar la reserva'));
    } finally {
      setReservaBusyId(null);
      fetchReservas();
      fetchParqueadero();
    }
  };

  const confirmNoShow = (reserva) => {
    Alert.alert(
      'Liberar celda',
      `¿El vehículo ${reserva.placa} no llegó? La celda volverá a quedar libre para otros clientes.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Liberar', style: 'destructive', onPress: () => closeReserva(reserva, 'cancelar') },
      ]
    );
  };

  const renderReservas = () => (
    <>
      <Text style={styles.sectionTitle}>
        RESERVAS ACTIVAS{reservas.length > 0 ? ` (${reservas.length})` : ''}
      </Text>
      {reservas.length === 0 ? (
        <View style={styles.reservasEmpty}>
          <MaterialCommunityIcons name="ticket-outline" size={20} color="#5A5A5E" />
          <Text style={styles.reservasEmptyText}>No hay reservas por ahora</Text>
        </View>
      ) : (
        reservas.map((reserva) => {
          const busy = reservaBusyId === reserva.id;
          return (
            <View key={reserva.id} style={styles.reservaCard}>
              <View style={styles.reservaInfoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reservaPlaca}>{reserva.placa}</Text>
                  <Text style={styles.reservaDetail} numberOfLines={1}>
                    {VEHICLE_SINGULAR[reserva.tipo_vehiculo]} · {reserva.cliente_nombre}
                  </Text>
                </View>
                <View style={styles.reservaExpiry}>
                  <Text style={styles.reservaExpiryLabel}>Vence</Text>
                  <Text style={styles.reservaExpiryTime}>{formatClock(reserva.expiraLocal)}</Text>
                </View>
              </View>
              <View style={styles.reservaActions}>
                <TouchableOpacity
                  style={[styles.reservaNoShowBtn, busy && { opacity: 0.5 }]}
                  onPress={() => confirmNoShow(reserva)}
                  disabled={busy}
                >
                  <Text style={styles.reservaNoShowText}>NO LLEGÓ</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reservaArrivedBtn, busy && { opacity: 0.5 }]}
                  onPress={() => closeReserva(reserva, 'completar')}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#000000" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#000000" />
                      <Text style={styles.reservaArrivedText}>LLEGÓ</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
      <View style={{ height: 12 }} />
    </>
  );

  const openEditModal = (type) => {
    setEditingType(type);
    if (type === 'nombre') {
      setEditNombre(parqueadero.nombre || '');
    } else {
      setEditDisponibles(parqueadero[`${type}_disponibles`]?.toString() || '0');
      setEditMax(parqueadero[`${type}_max`]?.toString() || '0');
      setEditPrecio(parqueadero[`${type}_precio`]?.toString() || '0');
    }
    setModalVisible(true);
  };

  // Arma lo que se envía al servidor; null si algún dato no es válido (ya avisado al dueño)
  const buildPayload = () => {
    if (editingType === 'nombre') {
      const nombre = editNombre.trim();
      if (!nombre) {
        Alert.alert('Nombre requerido', 'Escribe el nombre de tu parqueadero');
        return null;
      }
      return { nombre };
    }

    const disponibles = toNumber(editDisponibles);
    const max = toNumber(editMax);
    const precio = toNumber(editPrecio);

    if (!Number.isInteger(disponibles) || !Number.isInteger(max) || disponibles < 0 || max < 0) {
      Alert.alert('Valores inválidos', 'Las celdas deben ser números enteros, sin decimales ni negativos.');
      return null;
    }
    if (Number.isNaN(precio) || precio < 0) {
      Alert.alert('Precio inválido', 'Escribe el precio por hora solo con números, sin puntos ni signos.');
      return null;
    }
    if (disponibles > max) {
      Alert.alert('Revisa las celdas', 'Las celdas disponibles no pueden ser más que la capacidad máxima.');
      return null;
    }

    return {
      [`${editingType}_disponibles`]: disponibles,
      [`${editingType}_max`]: max,
      [`${editingType}_precio`]: precio,
    };
  };

  const saveChanges = async () => {
    const payload = buildPayload();
    if (!payload) return;

    try {
      setSavingModal(true);
      const response = await api.put('/api/parqueadero/me', payload);
      setParqueadero(response.data);
      setModalVisible(false);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', getErrorMessage(error, 'No se pudieron guardar los cambios'));
    } finally {
      setSavingModal(false);
    }
  };

  const renderCellCard = ({ key, label, icon, IconSet }) => {
    const max = parqueadero[`${key}_max`] || 0;
    const disponibles = parqueadero[`${key}_disponibles`] || 0;
    const canEnter = disponibles > 0;
    const canLeave = disponibles < max;

    return (
      <View key={key} style={styles.cellCard}>
        <View style={styles.cellTopRow}>
          <View style={[styles.cardLeft, { flex: 1 }]}>
            <View style={styles.iconBox}>
              <IconSet name={icon} size={24} color="#FFD200" />
            </View>
            <View style={[styles.cardTextContainer, { flex: 1 }]}>
              <Text style={styles.cardTitle}>Celdas {label}</Text>
              <Text style={styles.cardSubtitle}>
                Capacidad {max} · {formatPrice(parqueadero[`${key}_precio`])}/h
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => openEditModal(key)}
            accessibilityLabel={`Editar celdas de ${label}`}
          >
            <MaterialCommunityIcons name="pencil" size={18} color="#000000" />
          </TouchableOpacity>
        </View>

        {/* Contador: − entra un vehículo, + sale un vehículo */}
        <View style={styles.counterRow}>
          <TouchableOpacity
            style={[styles.counterBtn, !canEnter && styles.counterBtnDisabled]}
            onPress={() => adjustDisponibles(key, -1)}
            disabled={!canEnter}
            activeOpacity={0.7}
            accessibilityLabel={`Registrar entrada de ${label}`}
          >
            <Ionicons name="remove" size={22} color="#000000" />
            <Text style={styles.counterBtnText}>ENTRA</Text>
          </TouchableOpacity>

          <View style={styles.counterValue}>
            <Text style={[styles.counterNumber, !canEnter && styles.counterNumberFull]}>
              {disponibles}
            </Text>
            <Text style={styles.counterLabel}>{canEnter ? `de ${max} libres` : 'Lleno'}</Text>
          </View>

          <TouchableOpacity
            style={[styles.counterBtn, !canLeave && styles.counterBtnDisabled]}
            onPress={() => adjustDisponibles(key, 1)}
            disabled={!canLeave}
            activeOpacity={0.7}
            accessibilityLabel={`Registrar salida de ${label}`}
          >
            <Ionicons name="add" size={22} color="#000000" />
            <Text style={styles.counterBtnText}>SALE</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Porcentaje de celdas ocupadas sumando todos los tipos de vehículo
  const getOccupancy = () => {
    let total = 0;
    let libres = 0;
    VEHICLE_TYPES.forEach(({ key }) => {
      total += parqueadero[`${key}_max`] || 0;
      libres += Math.min(parqueadero[`${key}_disponibles`] || 0, parqueadero[`${key}_max`] || 0);
    });
    return total > 0 ? Math.round(((total - libres) / total) * 100) : null;
  };

  // US04: renderizar la mini-vista del mapa en la pantalla principal
  const renderLocationSection = () => {
    const hasLocation = hasValidCoords(parqueadero);
    const lat = hasLocation ? parseFloat(parqueadero.latitud) : null;
    const lng = hasLocation ? parseFloat(parqueadero.longitud) : null;

    return (
      <View style={styles.locationSection}>
        <Text style={styles.sectionTitle}>UBICACIÓN DEL PARQUEADERO</Text>
        
        {/* Tarjeta de dirección */}
        <View style={styles.addressCard}>
          <View style={styles.addressRow}>
            <View style={styles.addressIconBox}>
              <Ionicons name="location" size={20} color="#FFD200" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.addressLabel}>Dirección exacta</Text>
              <Text style={styles.addressText}>{parqueadero.direccion}</Text>
            </View>
          </View>

          {/* Vista de la ubicación: al tocar se abre la app de mapas del celular */}
          {hasLocation ? (
            <TouchableOpacity
              style={styles.mapPreviewContainer}
              onPress={() =>
                openInMaps({ latitude: lat, longitude: lng, label: parqueadero.nombre || 'Mi Parqueadero' })
              }
              activeOpacity={0.8}
            >
              <Ionicons name="map" size={30} color="#FFD200" />
              <Text style={styles.mapPreviewText}>VER EN MAPS</Text>
              <View style={styles.mapOverlay}>
                <View style={styles.coordBadge}>
                  <Ionicons name="navigate" size={12} color="#FFD200" />
                  <Text style={styles.coordText}>
                    {lat.toFixed(4)}, {lng.toFixed(4)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.noLocationContainer}>
              <Ionicons name="map-outline" size={40} color="#3A3A3C" />
              <Text style={styles.noLocationText}>
                No has configurado la ubicación
              </Text>
              <Text style={styles.noLocationSubtext}>
                Toca "Configurar Ubicación" para marcar dónde está tu parqueadero
              </Text>
            </View>
          )}

          {/* Botón para editar ubicación */}
          <TouchableOpacity 
            style={styles.editLocationBtn}
            onPress={() => navigation.navigate('EditLocation', { parqueadero })}
          >
            <Ionicons name="map" size={18} color="#000" style={{ marginRight: 8 }} />
            <Text style={styles.editLocationText}>
              {hasLocation ? 'EDITAR UBICACIÓN' : 'CONFIGURAR UBICACIÓN'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#FFD200" />
      </View>
    );
  }

  if (!parqueadero) {
    return (
      <SafeAreaView style={[styles.container, styles.errorContainer]}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />
        <Ionicons name="cloud-offline-outline" size={48} color="#3A3A3C" />
        <Text style={styles.errorTitle}>No se pudo cargar tu parqueadero</Text>
        <Text style={styles.errorText}>Revisa tu conexión a internet e inténtalo de nuevo.</Text>
        <TouchableOpacity style={styles.retryButton} onPress={retryLoad} activeOpacity={0.8}>
          <Text style={styles.retryButtonText}>REINTENTAR</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={confirmLogout} style={{ marginTop: 18 }}>
          <Text style={styles.logoutButtonText}>CERRAR SESIÓN</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const occupancy = getOccupancy();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Top Header */}
      <View style={[styles.header, tabletPadding]}>
        <View style={styles.parkappBadge}>
          <Text style={styles.parkappText}>PARKAPP</Text>
        </View>
        <TouchableOpacity style={styles.profileBadge} onPress={confirmLogout}>
          <Ionicons name="person-outline" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, tabletPadding]}
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
        {userName ? <Text style={styles.greeting}>Hola, {userName}</Text> : null}
        <Text style={styles.mainTitle}>Mi Parqueadero</Text>
        <Text style={styles.mainSubtitle}>Administra las celdas disponibles en tiempo real</Text>

        {/* Nombre del parqueadero (es el que ven los clientes) */}
        <Text style={styles.sectionTitle}>NOMBRE DEL PARQUEADERO</Text>
        <View style={styles.card}>
          <View style={[styles.cardLeft, { flex: 1 }]}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="parking" size={24} color="#FFD200" />
            </View>
            <View style={[styles.cardTextContainer, { flex: 1 }]}>
              <Text
                style={[styles.cardTitle, !parqueadero.nombre && styles.nameEmpty]}
                numberOfLines={1}
              >
                {parqueadero.nombre || 'Sin nombre'}
              </Text>
              <Text style={styles.cardSubtitle}>Así te verán los clientes</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal('nombre')}>
            <MaterialCommunityIcons name="pencil" size={18} color="#000000" />
          </TouchableOpacity>
        </View>
        <View style={{ height: 12 }} />

        {renderReservas()}

        <View style={isWideLayout && styles.columns}>
          <View style={isWideLayout && styles.column}>
            {/* Celdas Disponibles Section */}
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>CELDAS DISPONIBLES</Text>
              {occupancy !== null ? (
                <Text style={styles.occupancyText}>Ocupación {occupancy}%</Text>
              ) : null}
            </View>
            <Text style={styles.sectionHint}>
              Toca ENTRA cuando llega un vehículo y SALE cuando se va.
            </Text>

            {VEHICLE_TYPES.map(renderCellCard)}
          </View>

          <View style={isWideLayout && styles.column}>
            {/* US04: Sección de Ubicación del Parqueadero */}
            {renderLocationSection()}

            {/* Botón Cerrar Sesión */}
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={confirmLogout}
              activeOpacity={0.8}
            >
              <Ionicons name="exit-outline" size={20} color="#FF5252" style={{ marginRight: 8 }} />
              <Text style={styles.logoutButtonText}>CERRAR SESIÓN</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* Espacio extra al final */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingType === 'nombre'
                ? 'Editar Nombre'
                : `Editar Celdas de ${VEHICLE_TYPES.find((v) => v.key === editingType)?.label || ''}`}
            </Text>

            {editingType === 'nombre' ? (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Nombre del parqueadero</Text>
                <TextInput
                  style={styles.input}
                  value={editNombre}
                  onChangeText={setEditNombre}
                  placeholder="Ej: Parqueadero El Centro"
                  placeholderTextColor="#666"
                  maxLength={100}
                  autoCapitalize="words"
                  autoFocus
                />
              </View>
            ) : (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Celdas Disponibles</Text>
                  <TextInput
                    style={styles.input}
                    value={editDisponibles}
                    onChangeText={setEditDisponibles}
                    keyboardType="number-pad"
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Capacidad Máxima</Text>
                  <TextInput
                    style={styles.input}
                    value={editMax}
                    onChangeText={setEditMax}
                    keyboardType="number-pad"
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Precio por Hora ($)</Text>
                  <TextInput
                    style={styles.input}
                    value={editPrecio}
                    onChangeText={setEditPrecio}
                    keyboardType="numeric"
                    placeholderTextColor="#666"
                  />
                </View>
              </>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setModalVisible(false)}
                disabled={savingModal}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, savingModal && { opacity: 0.6 }]}
                onPress={saveChanges}
                disabled={savingModal}
              >
                {savingModal ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.modalSaveText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
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
    paddingTop: 15,
    marginBottom: 20,
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
  tabletPadding: {
    paddingHorizontal: 40,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  columns: {
    flexDirection: 'row',
    gap: 24,
  },
  column: {
    flex: 1,
  },
  greeting: {
    fontSize: 14,
    color: '#FFD200',
    fontWeight: '600',
    marginBottom: 2,
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  mainSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#A0A0A0',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#161618',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTextContainer: {
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
  },
  nameEmpty: {
    color: '#5A5A5E',
    fontStyle: 'italic',
  },
  // Tarjeta de celdas con contador
  cellCard: {
    backgroundColor: '#161618',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cellTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  counterBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#FFD200',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  counterBtnDisabled: {
    opacity: 0.3,
  },
  counterBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  counterValue: {
    minWidth: 84,
    alignItems: 'center',
  },
  counterNumber: {
    color: '#FFD200',
    fontSize: 26,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  counterNumberFull: {
    color: '#FF5252',
  },
  counterLabel: {
    color: '#8E8E93',
    fontSize: 11,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  occupancyText: {
    color: '#FFD200',
    fontSize: 12,
    fontWeight: 'bold',
  },
  sectionHint: {
    color: '#5A5A5E',
    fontSize: 12,
    marginBottom: 12,
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFD200',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // US04: Sección de ubicación
  locationSection: {
    marginTop: 10,
  },
  addressCard: {
    backgroundColor: '#161618',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  addressIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 210, 0, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Mini mapa preview
  mapPreviewContainer: {
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    backgroundColor: '#0F0F11',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  mapPreviewText: {
    color: '#FFD200',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
  },
  coordBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  coordText: {
    color: '#FFFFFF',
    fontSize: 11,
    marginLeft: 5,
    fontWeight: '500',
  },

  // Sin ubicación configurada
  noLocationContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    borderRadius: 12,
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  noLocationText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
  },
  noLocationSubtext: {
    color: '#5A5A5E',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },

  // Botón editar ubicación
  editLocationBtn: {
    backgroundColor: '#FFD200',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editLocationText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    color: '#A0A0A0',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#0F0F10',
    borderWidth: 1,
    borderColor: '#FFD200',
    borderRadius: 10,
    color: '#FFFFFF',
    paddingHorizontal: 14,
    height: 48,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    marginRight: 10,
  },
  modalCancelText: {
    color: '#FF5252',
    fontWeight: 'bold',
    fontSize: 15,
  },
  modalSaveBtn: {
    flex: 1,
    backgroundColor: '#FFD200',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 15,
  },
  logoutButton: {
    backgroundColor: '#161618',
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    marginTop: 10,
  },
  logoutButtonText: {
    color: '#FF5252',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },

  // Reservas activas
  reservasEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 14,
  },
  reservasEmptyText: {
    color: '#5A5A5E',
    fontSize: 13,
  },
  reservaCard: {
    backgroundColor: '#1F1F10',
    borderWidth: 1,
    borderColor: '#FFD200',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  reservaInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reservaPlaca: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  reservaDetail: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  reservaExpiry: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  reservaExpiryLabel: {
    color: '#8E8E93',
    fontSize: 11,
  },
  reservaExpiryTime: {
    color: '#FFD200',
    fontSize: 16,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  reservaActions: {
    flexDirection: 'row',
    gap: 10,
  },
  reservaNoShowBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FF5252',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reservaNoShowText: {
    color: '#FF5252',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  reservaArrivedBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FFD200',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  reservaArrivedText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },

  // Error al cargar
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 14,
    textAlign: 'center',
  },
  errorText: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#FFD200',
    paddingHorizontal: 28,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#000000',
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
});

export default OwnerHomeScreen;
