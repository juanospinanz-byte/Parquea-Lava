import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Switch,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../services/api';
import useResponsive from '../hooks/useResponsive';
import useRealtime from '../hooks/useRealtime';
import ParkingMap from '../components/ParkingMap';
import AppHeader from '../components/AppHeader';
import Field from '../components/Field';
import { getStoredUser, logout } from '../services/session';
import { hasValidCoords, openInMaps } from '../utils/maps';
import { VEHICLE_SINGULAR, withLocalExpiry, formatClock, getErrorMessage } from '../utils/reservas';
import { formatPrice, fotoUrl, formatHorario, horaCorta, tieneHorario, formatRating } from '../utils/parqueadero';
import { notifyNow, isRemotePushEnabled } from '../utils/notifications';
import { colors } from '../theme';

// Respaldo por si se cae el tiempo real: cada cuánto se consulta de nuevo mientras la pantalla está abierta
const REFRESH_INTERVAL_MS = 30000;

const VEHICLE_TYPES = [
  { key: 'motos', label: 'Motos', icon: 'motorbike', IconSet: MaterialCommunityIcons },
  { key: 'carros', label: 'Carros', icon: 'car-sport', IconSet: Ionicons },
  { key: 'camiones', label: 'Camiones', icon: 'truck-outline', IconSet: MaterialCommunityIcons },
];

// Convierte lo escrito en el formulario a número (vacío = 0); NaN si no es un número válido
const toNumber = (text) => (text.trim() === '' ? 0 : Number(text.trim()));

const HORA_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/;

const OwnerHomeScreen = ({ navigation }) => {
  const [userName, setUserName] = useState('');
  const [parqueadero, setParqueadero] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reservas, setReservas] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Reserva con una acción (llegó / no llegó) en curso
  const [reservaBusyId, setReservaBusyId] = useState(null);
  const { isTablet, isWideLayout } = useResponsive();
  const tabletPadding = isTablet && styles.tabletPadding;
  // Tipos de vehículo con un cambio de +/− en curso (evita toques dobles con datos viejos)
  const adjustingRef = useRef({});
  // Reservas ya vistas: las nuevas se avisan con una notificación (null = primera carga)
  const knownReservasRef = useRef(null);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  // 'motos', 'carros', 'camiones', 'nombre', 'horario' o 'lavado'
  const [editingType, setEditingType] = useState(null);
  const [savingModal, setSavingModal] = useState(false);

  // Edit Form State
  const [editDisponibles, setEditDisponibles] = useState('');
  const [editMax, setEditMax] = useState('');
  const [editPrecio, setEditPrecio] = useState('');
  const [editNombre, setEditNombre] = useState('');
  const [editApertura, setEditApertura] = useState('');
  const [editCierre, setEditCierre] = useState('');
  const [edit24h, setEdit24h] = useState(true);
  const [editServicio, setEditServicio] = useState(null); // servicio de lavado que se edita (null = nuevo)
  const [editServicioNombre, setEditServicioNombre] = useState('');
  const [editServicioPrecio, setEditServicioPrecio] = useState('');

  // Se consulta al entrar y al volver a la pantalla (sin taparla con el indicador de carga);
  // el nombre se relee por si se cambió en Mi Perfil
  useFocusEffect(
    useCallback(() => {
      getStoredUser().then((user) => setUserName(user?.nombre || ''));
      const refresh = () => {
        fetchParqueadero();
        fetchReservas();
      };
      refresh();
      fetchServicios();
      const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [])
  );

  // Tiempo real: una reserva nueva, cancelada o vencida actualiza la pantalla al instante
  useRealtime('reservas:actualizadas', () => {
    fetchReservas();
    fetchParqueadero();
  });

  const fetchReservas = async () => {
    try {
      const response = await api.get('/api/reservas/parqueadero');
      const nuevas = response.data.map(withLocalExpiry);

      // Aviso de reservas nuevas (si el servidor no lo envía ya como push)
      if (knownReservasRef.current && !isRemotePushEnabled()) {
        nuevas
          .filter((r) => !knownReservasRef.current.has(r.id))
          .forEach((r) =>
            notifyNow(
              'Nueva reserva',
              `${VEHICLE_SINGULAR[r.tipo_vehiculo]} · Placa ${r.placa}${r.servicio_nombre ? ` · ${r.servicio_nombre}` : ''}`
            )
          );
      }
      knownReservasRef.current = new Set(nuevas.map((r) => r.id));
      setReservas(nuevas);
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

  const fetchServicios = async () => {
    try {
      const response = await api.get('/api/lavado');
      setServicios(response.data);
    } catch (error) {
      console.error(error);
    }
  };

  const retryLoad = () => {
    setLoading(true);
    fetchParqueadero();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const [ok] = await Promise.all([fetchParqueadero(), fetchReservas(), fetchServicios()]);
    setRefreshing(false);
    if (!ok) Alert.alert('Sin conexión', 'No se pudo actualizar la información del parqueadero');
  };

  const confirmLogout = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => logout(navigation) },
    ]);
  };

  // Abrir / cerrar el parqueadero: cerrado, los clientes no pueden reservar
  const toggleAbierto = async (abierto) => {
    const anterior = parqueadero.abierto;
    setParqueadero((p) => ({ ...p, abierto: abierto ? 1 : 0 }));
    try {
      const response = await api.put('/api/parqueadero/me', { abierto });
      setParqueadero(response.data);
    } catch (error) {
      console.error(error);
      setParqueadero((p) => ({ ...p, abierto: anterior }));
      Alert.alert('Error', getErrorMessage(error, 'No se pudo cambiar el estado del parqueadero'));
    }
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

  // --- Foto de la entrada ---
  const uploadPhoto = async (asset) => {
    try {
      setUploadingPhoto(true);
      const response = await api.put('/api/parqueadero/me/foto', { imagen: asset.base64 });
      setParqueadero(response.data);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', getErrorMessage(error, 'No se pudo subir la foto'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const pickPhoto = async (fromCamera) => {
    try {
      const options = { mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.6, base64: true };
      if (fromCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Sin permiso', 'Activa el permiso de la cámara para tomar la foto.');
          return;
        }
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets?.[0]?.base64) {
        uploadPhoto(result.assets[0]);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo abrir la cámara o la galería');
    }
  };

  const openPhotoOptions = () => {
    const options = [
      { text: 'Tomar foto', onPress: () => pickPhoto(true) },
      { text: 'Elegir de la galería', onPress: () => pickPhoto(false) },
    ];
    if (parqueadero.foto) {
      options.push({ text: 'Quitar foto', style: 'destructive', onPress: removePhoto });
    }
    options.push({ text: 'Cancelar', style: 'cancel' });
    Alert.alert('Foto de la entrada', 'Ayuda a los clientes a reconocer tu parqueadero', options);
  };

  const removePhoto = async () => {
    try {
      setUploadingPhoto(true);
      const response = await api.delete('/api/parqueadero/me/foto');
      setParqueadero(response.data);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', getErrorMessage(error, 'No se pudo quitar la foto'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  // --- Servicios de lavado ---
  const confirmDeleteServicio = (servicio) => {
    Alert.alert('Eliminar servicio', `¿Quitar "${servicio.nombre}" de tus servicios de lavado?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            const response = await api.delete(`/api/lavado/${servicio.id}`);
            setServicios(response.data);
            fetchParqueadero();
          } catch (error) {
            console.error(error);
            Alert.alert('Error', getErrorMessage(error, 'No se pudo eliminar el servicio'));
          }
        },
      },
    ]);
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
          <MaterialCommunityIcons name="ticket-outline" size={20} color={colors.textFaint} />
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
                  {reserva.servicio_nombre ? (
                    <View style={styles.reservaWash}>
                      <MaterialCommunityIcons name="car-wash" size={14} color={colors.primary} />
                      <Text style={styles.reservaWashText} numberOfLines={1}>
                        {reserva.servicio_nombre} · {formatPrice(reserva.servicio_precio)}
                      </Text>
                    </View>
                  ) : null}
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
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color={colors.onPrimary} />
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

  const openEditModal = (type, servicio = null) => {
    setEditingType(type);
    if (type === 'nombre') {
      setEditNombre(parqueadero.nombre || '');
    } else if (type === 'horario') {
      setEdit24h(!tieneHorario(parqueadero));
      setEditApertura(horaCorta(parqueadero.hora_apertura) || '06:00');
      setEditCierre(horaCorta(parqueadero.hora_cierre) || '22:00');
    } else if (type === 'lavado') {
      setEditServicio(servicio);
      setEditServicioNombre(servicio?.nombre || '');
      setEditServicioPrecio(servicio ? String(parseFloat(servicio.precio)) : '');
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

    if (editingType === 'horario') {
      // Vacío = abierto las 24 horas
      if (edit24h) return { hora_apertura: '', hora_cierre: '' };
      if (!HORA_REGEX.test(editApertura.trim()) || !HORA_REGEX.test(editCierre.trim())) {
        Alert.alert('Hora inválida', 'Escribe las horas en formato de 24 horas, por ejemplo 06:00 y 22:00.');
        return null;
      }
      if (editApertura.trim() === editCierre.trim()) {
        Alert.alert('Revisa el horario', 'La hora de apertura y la de cierre no pueden ser iguales.');
        return null;
      }
      return { hora_apertura: editApertura.trim(), hora_cierre: editCierre.trim() };
    }

    if (editingType === 'lavado') {
      const nombre = editServicioNombre.trim();
      const precio = toNumber(editServicioPrecio);
      if (!nombre) {
        Alert.alert('Nombre requerido', 'Escribe el nombre del servicio, por ejemplo "Lavado general".');
        return null;
      }
      if (!editServicioPrecio.trim() || Number.isNaN(precio) || precio < 0) {
        Alert.alert('Precio inválido', 'Escribe el precio solo con números, sin puntos ni signos.');
        return null;
      }
      return { nombre, precio };
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
      if (editingType === 'lavado') {
        const response = editServicio
          ? await api.put(`/api/lavado/${editServicio.id}`, payload)
          : await api.post('/api/lavado', payload);
        setServicios(response.data);
        fetchParqueadero();
      } else {
        const response = await api.put('/api/parqueadero/me', payload);
        setParqueadero(response.data);
      }
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
    // Parte de la barra que está ocupada
    const ocupado = max > 0 ? Math.min(Math.max((max - disponibles) / max, 0), 1) : 0;

    return (
      <View key={key} style={styles.cellCard}>
        <View style={styles.cellTopRow}>
          <View style={[styles.cardLeft, { flex: 1 }]}>
            <View style={styles.iconBox}>
              <IconSet name={icon} size={24} color={colors.primary} />
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
            <MaterialCommunityIcons name="pencil" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Barra de ocupación: se pone roja cuando no quedan celdas */}
        <View style={styles.occupancyTrack}>
          <View
            style={[
              styles.occupancyFill,
              { width: `${ocupado * 100}%` },
              !canEnter && max > 0 && styles.occupancyFillFull,
            ]}
          />
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
            <Ionicons name="remove" size={22} color={colors.onPrimary} />
            <Text style={styles.counterBtnText}>ENTRA</Text>
          </TouchableOpacity>

          <View style={styles.counterValue}>
            <Text style={[styles.counterNumber, !canEnter && styles.counterNumberFull]}>
              {disponibles}
            </Text>
            <Text style={styles.counterLabel}>{canEnter ? `de ${max} libres` : 'Lleno'}</Text>
          </View>

          <TouchableOpacity
            style={[styles.counterBtn, styles.counterBtnSecondary, !canLeave && styles.counterBtnDisabled]}
            onPress={() => adjustDisponibles(key, 1)}
            disabled={!canLeave}
            activeOpacity={0.7}
            accessibilityLabel={`Registrar salida de ${label}`}
          >
            <Ionicons name="add" size={22} color={colors.primary} />
            <Text style={[styles.counterBtnText, styles.counterBtnTextSecondary]}>SALE</Text>
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

  // Estado (abierto / cerrado / fuera de horario) y horario de atención
  const renderStatus = () => {
    const abiertoPorDueno = !!Number(parqueadero.abierto);
    const fueraDeHorario = abiertoPorDueno && !Number(parqueadero.abierto_ahora);
    const titulo = !abiertoPorDueno ? 'CERRADO' : fueraDeHorario ? 'FUERA DE HORARIO' : 'ABIERTO';
    const texto = !abiertoPorDueno
      ? 'Los clientes ven que estás cerrado y no pueden reservar'
      : fueraDeHorario
      ? `Abres a las ${horaCorta(parqueadero.hora_apertura)}: mientras tanto no recibes reservas`
      : 'Los clientes pueden reservar celdas';
    const cerradoAhora = !abiertoPorDueno || fueraDeHorario;

    return (
      <View style={[styles.statusCard, cerradoAhora && styles.statusCardClosed]}>
        <View style={styles.statusTopRow}>
          <View style={[styles.statusDot, cerradoAhora && styles.statusDotClosed]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>{titulo}</Text>
            <Text style={styles.statusText}>{texto}</Text>
          </View>
          <Switch
            value={abiertoPorDueno}
            onValueChange={toggleAbierto}
            trackColor={{ false: colors.borderStrong, true: colors.primary }}
            thumbColor={colors.white}
            ios_backgroundColor={colors.borderStrong}
          />
        </View>
        <TouchableOpacity style={styles.horarioRow} onPress={() => openEditModal('horario')} activeOpacity={0.8}>
          <Ionicons name="time-outline" size={18} color={colors.primary} />
          <Text style={styles.horarioText}>Horario: {formatHorario(parqueadero)}</Text>
          <Text style={styles.horarioEdit}>Cambiar</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Foto de la entrada: la ven los clientes en el detalle del parqueadero
  const renderPhoto = () => {
    const url = fotoUrl(parqueadero);
    return (
      <>
        <Text style={styles.sectionTitle}>FOTO DE LA ENTRADA</Text>
        <TouchableOpacity
          style={[styles.photoCard, !url && styles.photoCardEmpty]}
          onPress={openPhotoOptions}
          disabled={uploadingPhoto}
          activeOpacity={0.8}
        >
          {url ? <Image source={{ uri: url }} style={styles.photo} resizeMode="cover" /> : null}
          {uploadingPhoto ? (
            <View style={styles.photoOverlay}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : url ? (
            <View style={styles.photoBadge}>
              <Ionicons name="camera" size={14} color={colors.onPrimary} />
              <Text style={styles.photoBadgeText}>CAMBIAR</Text>
            </View>
          ) : (
            <>
              <Ionicons name="camera-outline" size={32} color={colors.primary} />
              <Text style={styles.photoEmptyTitle}>AGREGAR FOTO</Text>
              <Text style={styles.photoEmptyText}>Así los clientes reconocen la entrada al llegar</Text>
            </>
          )}
        </TouchableOpacity>
      </>
    );
  };

  // Servicios de lavado que el cliente puede agregar a su reserva
  const renderLavado = () => (
    <>
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>SERVICIOS DE LAVADO</Text>
        <TouchableOpacity onPress={() => openEditModal('lavado')} style={styles.addServiceBtn}>
          <Ionicons name="add" size={16} color={colors.onPrimary} />
          <Text style={styles.addServiceText}>AGREGAR</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sectionHint}>Los clientes pueden agregar un lavado al reservar su celda.</Text>
      {servicios.length === 0 ? (
        <TouchableOpacity style={styles.reservasEmpty} onPress={() => openEditModal('lavado')}>
          <MaterialCommunityIcons name="car-wash" size={20} color={colors.textFaint} />
          <Text style={styles.reservasEmptyText}>Aún no ofreces lavados. Toca para agregar uno.</Text>
        </TouchableOpacity>
      ) : (
        servicios.map((servicio) => (
          <View key={servicio.id} style={styles.serviceRow}>
            <MaterialCommunityIcons name="car-wash" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.serviceName} numberOfLines={1}>
                {servicio.nombre}
              </Text>
              <Text style={styles.servicePrice}>{formatPrice(servicio.precio)}</Text>
            </View>
            <TouchableOpacity
              style={styles.serviceIconBtn}
              onPress={() => openEditModal('lavado', servicio)}
              accessibilityLabel={`Editar ${servicio.nombre}`}
            >
              <MaterialCommunityIcons name="pencil" size={16} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.serviceIconBtn}
              onPress={() => confirmDeleteServicio(servicio)}
              accessibilityLabel={`Eliminar ${servicio.nombre}`}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ))
      )}
      <View style={{ height: 20 }} />
    </>
  );

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
              <Ionicons name="location" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.addressLabel}>Dirección exacta</Text>
              <Text style={styles.addressText}>{parqueadero.direccion}</Text>
            </View>
          </View>

          {/* Mapa con el punto del parqueadero: al tocarlo se abre la app de mapas del celular */}
          {hasLocation ? (
            <TouchableOpacity
              style={styles.mapPreviewContainer}
              onPress={() =>
                openInMaps({ latitude: lat, longitude: lng, label: parqueadero.nombre || 'Mi Parqueadero' })
              }
              activeOpacity={0.8}
            >
              <ParkingMap
                style={StyleSheet.absoluteFill}
                interactive={false}
                markers={[{ id: parqueadero.id, latitude: lat, longitude: lng, label: 'P' }]}
              />
              <View style={styles.mapOverlay}>
                <View style={styles.coordBadge}>
                  <Ionicons name="navigate" size={12} color={colors.primary} />
                  <Text style={styles.coordText}>VER EN MAPS</Text>
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.noLocationContainer}>
              <Ionicons name="map-outline" size={40} color={colors.borderStrong} />
              <Text style={styles.noLocationText}>
                No has configurado la ubicación
              </Text>
              <Text style={styles.noLocationSubtext}>
                Los clientes no verán tu parqueadero hasta que marques dónde está
              </Text>
            </View>
          )}

          {/* Botón para editar ubicación */}
          <TouchableOpacity
            style={styles.editLocationBtn}
            onPress={() => navigation.navigate('EditLocation', { parqueadero })}
          >
            <Ionicons name="map" size={18} color={colors.onPrimary} style={{ marginRight: 8 }} />
            <Text style={styles.editLocationText}>
              {hasLocation ? 'EDITAR UBICACIÓN' : 'CONFIGURAR UBICACIÓN'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderModalFields = () => {
    if (editingType === 'nombre') {
      return (
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Nombre del parqueadero</Text>
          <Field
            value={editNombre}
            onChangeText={setEditNombre}
            placeholder="Ej: Parqueadero El Centro"
            maxLength={100}
            autoCapitalize="words"
            autoFocus
          />
        </View>
      );
    }

    if (editingType === 'horario') {
      return (
        <>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Abierto las 24 horas</Text>
            <Switch
              value={edit24h}
              onValueChange={setEdit24h}
              trackColor={{ false: colors.borderStrong, true: colors.primary }}
              thumbColor={colors.white}
              ios_backgroundColor={colors.borderStrong}
            />
          </View>
          {!edit24h ? (
            <View style={styles.hoursRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Abre (24 h)</Text>
                <Field
                  value={editApertura}
                  onChangeText={setEditApertura}
                  placeholder="06:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Cierra (24 h)</Text>
                <Field
                  value={editCierre}
                  onChangeText={setEditCierre}
                  placeholder="22:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
            </View>
          ) : null}
          <Text style={styles.modalHint}>
            Fuera del horario los clientes ven el parqueadero cerrado y no pueden reservar. Si cierras
            después de medianoche (ej: 18:00 a 02:00) también funciona.
          </Text>
        </>
      );
    }

    if (editingType === 'lavado') {
      return (
        <>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Servicio</Text>
            <Field
              value={editServicioNombre}
              onChangeText={setEditServicioNombre}
              placeholder="Ej: Lavado general, Motor, Tapicería"
              maxLength={80}
              autoCapitalize="sentences"
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Precio ($)</Text>
            <Field
              value={editServicioPrecio}
              onChangeText={setEditServicioPrecio}
              placeholder="15000"
              keyboardType="numeric"
            />
          </View>
        </>
      );
    }

    return (
      <>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Celdas Disponibles</Text>
          <Field
            value={editDisponibles}
            onChangeText={setEditDisponibles}
            keyboardType="number-pad"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Capacidad Máxima</Text>
          <Field
            value={editMax}
            onChangeText={setEditMax}
            keyboardType="number-pad"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Precio por Hora ($)</Text>
          <Field
            value={editPrecio}
            onChangeText={setEditPrecio}
            keyboardType="numeric"
          />
        </View>
      </>
    );
  };

  const modalTitle = () => {
    if (editingType === 'nombre') return 'Editar Nombre';
    if (editingType === 'horario') return 'Horario de Atención';
    if (editingType === 'lavado') return editServicio ? 'Editar Lavado' : 'Nuevo Servicio de Lavado';
    return `Editar Celdas de ${VEHICLE_TYPES.find((v) => v.key === editingType)?.label || ''}`;
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!parqueadero) {
    return (
      <SafeAreaView style={[styles.container, styles.errorContainer]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <Ionicons name="cloud-offline-outline" size={48} color={colors.borderStrong} />
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
  const rating = formatRating(parqueadero);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <AppHeader style={tabletPadding} onProfilePress={() => navigation.navigate('Profile')} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, tabletPadding]}
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
        {userName ? <Text style={styles.greeting}>Hola, {userName}</Text> : null}
        <Text style={styles.mainTitle}>Mi Parqueadero</Text>
        <Text style={styles.mainSubtitle}>Administra las celdas disponibles en tiempo real</Text>

        {/* Estado del parqueadero: cerrado o fuera de horario no recibe reservas */}
        {renderStatus()}

        {/* Historial, resumen y calificación */}
        <TouchableOpacity style={styles.historyCard} onPress={() => navigation.navigate('History')} activeOpacity={0.8}>
          <View style={styles.iconBoxSmall}>
            <MaterialCommunityIcons name="chart-box-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.historyTitle}>Historial y resumen</Text>
            <Text style={styles.historyText}>
              {rating ? `★ ${rating} · ` : ''}Reservas, ingresos estimados y lavados
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </TouchableOpacity>

        {/* Nombre del parqueadero (es el que ven los clientes) */}
        <Text style={styles.sectionTitle}>NOMBRE DEL PARQUEADERO</Text>
        <View style={styles.card}>
          <View style={[styles.cardLeft, { flex: 1 }]}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="parking" size={24} color={colors.primary} />
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
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => openEditModal('nombre')}
            accessibilityLabel="Editar nombre del parqueadero"
          >
            <MaterialCommunityIcons name="pencil" size={18} color={colors.primary} />
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

            <View style={{ height: 8 }} />
            {renderLavado()}
          </View>

          <View style={isWideLayout && styles.column}>
            {renderPhoto()}

            {/* US04: Sección de Ubicación del Parqueadero */}
            {renderLocationSection()}

            {/* Botón Cerrar Sesión */}
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={confirmLogout}
              activeOpacity={0.8}
            >
              <Ionicons name="exit-outline" size={20} color={colors.danger} style={{ marginRight: 8 }} />
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
            <Text style={styles.modalTitle}>{modalTitle()}</Text>

            {renderModalFields()}

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
                  <ActivityIndicator size="small" color={colors.onPrimary} />
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
    backgroundColor: colors.bg,
  },
  tabletPadding: {
    paddingHorizontal: 40,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
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
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 2,
  },
  mainTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  mainSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 24,
  },

  // Abierto / cerrado
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.successBorder,
    padding: 14,
    marginBottom: 20,
  },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  horarioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  horarioText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  horarioEdit: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Acceso al historial
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 20,
  },
  iconBoxSmall: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  historyText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },

  // Foto de la entrada
  photoCard: {
    height: 170,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoCardEmpty: {
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderStyle: 'dashed',
    gap: 4,
    paddingHorizontal: 20,
  },
  photo: {
    ...StyleSheet.absoluteFillObject,
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  photoBadgeText: {
    color: colors.onPrimary,
    fontSize: 11,
    fontWeight: 'bold',
  },
  photoEmptyTitle: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.8,
    marginTop: 6,
  },
  photoEmptyText: {
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'center',
  },

  // Servicios de lavado
  addServiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addServiceText: {
    color: colors.onPrimary,
    fontSize: 11,
    fontWeight: 'bold',
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  serviceName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  servicePrice: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 2,
  },
  serviceIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Campos del modal de horario
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  hoursRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 6,
  },

  statusCardClosed: {
    borderColor: colors.dangerBorder,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  statusDotClosed: {
    backgroundColor: colors.danger,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.primarySoft,
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
    color: colors.text,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
  },
  nameEmpty: {
    color: colors.textFaint,
    fontStyle: 'italic',
  },
  // Tarjeta de celdas con contador
  cellCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  cellTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  occupancyTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
    marginBottom: 14,
  },
  occupancyFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  occupancyFillFull: {
    backgroundColor: colors.danger,
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
    backgroundColor: colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  counterBtnSecondary: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  counterBtnDisabled: {
    opacity: 0.3,
  },
  counterBtnText: {
    color: colors.onPrimary,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  counterBtnTextSecondary: {
    color: colors.primary,
  },
  counterValue: {
    minWidth: 84,
    alignItems: 'center',
  },
  counterNumber: {
    color: colors.primary,
    fontSize: 26,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  counterNumberFull: {
    color: colors.danger,
  },
  counterLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  occupancyText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  sectionHint: {
    color: colors.textFaint,
    fontSize: 12,
    marginBottom: 12,
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // US04: Sección de ubicación
  locationSection: {
    marginTop: 10,
  },
  addressCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addressText: {
    color: colors.text,
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
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  mapPreviewText: {
    color: colors.primary,
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
    color: colors.text,
    fontSize: 11,
    marginLeft: 5,
    fontWeight: '500',
  },

  // Sin ubicación configurada
  noLocationContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    borderStyle: 'dashed',
    marginBottom: 16,
  },
  noLocationText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
  },
  noLocationSubtext: {
    color: colors.textFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20,
  },

  // Botón editar ubicación
  editLocationBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editLocationText: {
    color: colors.onPrimary,
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
    backgroundColor: colors.surfaceRaised,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
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
    color: colors.danger,
    fontWeight: 'bold',
    fontSize: 15,
  },
  modalSaveBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalSaveText: {
    color: colors.onPrimary,
    fontWeight: 'bold',
    fontSize: 15,
  },
  logoutButton: {
    backgroundColor: colors.surface,
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
  },
  logoutButtonText: {
    color: colors.danger,
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
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 14,
  },
  reservasEmptyText: {
    color: colors.textFaint,
    fontSize: 13,
  },
  reservaCard: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
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
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  reservaDetail: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  reservaWash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  reservaWashText: {
    flex: 1,
    color: colors.primary,
    fontSize: 12,
  },
  reservaExpiry: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  reservaExpiryLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  reservaExpiryTime: {
    color: colors.primary,
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
    borderColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reservaNoShowText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  reservaArrivedBtn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  reservaArrivedText: {
    color: colors.onPrimary,
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
    color: colors.text,
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 14,
    textAlign: 'center',
  },
  errorText: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
  },
  retryButtonText: {
    color: colors.onPrimary,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
});

export default OwnerHomeScreen;
