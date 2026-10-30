import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../services/api';
import useResponsive from '../hooks/useResponsive';
import useRealtime from '../hooks/useRealtime';
import ParkingMap from '../components/ParkingMap';
import StarRating from '../components/StarRating';
import { hasValidCoords, openInMaps, openDirections } from '../utils/maps';
import { scheduleReservaReminder, cancelReservaReminder } from '../utils/notifications';
import { fotoUrl, formatHorario, estaAbiertoAhora, motivoCerrado } from '../utils/parqueadero';
import {
  RESERVA_MINUTOS,
  VEHICLE_SINGULAR,
  withLocalExpiry,
  formatCountdown,
  getErrorMessage,
} from '../utils/reservas';

// US06: los cambios llegan al instante por tiempo real; esto es un respaldo por si se cae la conexión
const REFRESH_INTERVAL_MS = 30000;

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
  const [now, setNow] = useState(new Date());

  // Reserva activa del cliente (puede ser de este u otro parqueadero)
  const [reserva, setReserva] = useState(null);
  const [reserveModalVisible, setReserveModalVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [placa, setPlaca] = useState('');
  const [selectedServicio, setSelectedServicio] = useState(null); // lavado opcional (id)
  const [reserving, setReserving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [opiniones, setOpiniones] = useState([]);

  const { isTablet, isWideLayout } = useResponsive();

  // Reloj en tiempo real: avanza cada segundo mientras la pantalla esté visible
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
      const clock = setInterval(() => setNow(new Date()), 1000);
      return () => clearInterval(clock);
    }, [])
  );

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

  const fetchOpiniones = useCallback(async () => {
    try {
      const response = await api.get(`/api/parqueadero/${parqueaderoId}/calificaciones`);
      setOpiniones(response.data);
    } catch (error) {
      console.error(error);
    }
  }, [parqueaderoId]);

  // Si el dueño registra la llegada o la reserva vence, deja de aparecer aquí
  const fetchMiReserva = useCallback(async () => {
    try {
      const response = await api.get('/api/reservas/mia');
      setReserva(withLocalExpiry(response.data || null));
    } catch (error) {
      console.error(error);
    }
  }, []);

  // Consulta en tiempo real: se refresca al entrar y cada pocos segundos mientras la pantalla esté visible
  useFocusEffect(
    useCallback(() => {
      const refresh = () => {
        fetchParqueadero();
        fetchMiReserva();
      };
      refresh();
      fetchOpiniones();
      const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
      return () => clearInterval(interval);
    }, [fetchParqueadero, fetchMiReserva, fetchOpiniones])
  );

  // Tiempo real: el servidor avisa cuando cambia este parqueadero o la reserva del cliente
  useRealtime('parqueadero:actualizado', ({ id }) => {
    if (id === Number(parqueaderoId)) {
      fetchParqueadero();
      fetchOpiniones();
    }
  });
  useRealtime('reservas:actualizadas', fetchMiReserva);

  // Recordatorio 5 minutos antes de que venza la reserva (se quita si ya no hay reserva)
  useEffect(() => {
    if (reserva) scheduleReservaReminder(reserva);
    else cancelReservaReminder();
  }, [reserva]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchParqueadero(), fetchMiReserva(), fetchOpiniones()]);
    setRefreshing(false);
  };

  const getMapsTarget = () => ({
    latitude: parseFloat(parqueadero.latitud),
    longitude: parseFloat(parqueadero.longitud),
    label: parqueadero.nombre || 'Parqueadero',
  });

  // Ruta en la app de mapas del celular (Apple Maps, Google Maps, Waze...)
  const openExternalMaps = () => {
    if (!parqueadero.latitud || !parqueadero.longitud) {
      Alert.alert('Sin coordenadas', 'Este parqueadero aún no tiene coordenadas GPS registradas.');
      return;
    }
    openDirections(getMapsTarget());
  };

  const reservaAqui = reserva && reserva.parqueadero_id === parqueaderoId;

  const openReserveModal = () => {
    // Si ya tiene una reserva en otro parqueadero, se le ofrece ir a verla
    if (reserva && !reservaAqui) {
      Alert.alert(
        'Ya tienes una reserva',
        `Tienes una celda reservada en ${reserva.parqueadero_nombre || 'otro parqueadero'}. Cancélala para reservar aquí.`,
        [
          { text: 'Cerrar', style: 'cancel' },
          {
            text: 'Ver reserva',
            onPress: () => navigation.push('ParkingDetail', { parqueaderoId: reserva.parqueadero_id }),
          },
        ]
      );
      return;
    }
    const firstAvailable = VEHICLE_TYPES.find(({ key }) => (parqueadero[`${key}_disponibles`] || 0) > 0);
    setSelectedType(firstAvailable?.key || null);
    setSelectedServicio(null);
    setReserveModalVisible(true);
  };

  const confirmReserve = async () => {
    const placaLimpia = placa.toUpperCase().replace(/[\s-]/g, '');
    if (!selectedType) {
      Alert.alert('Elige un vehículo', 'Selecciona el tipo de vehículo que vas a parquear.');
      return;
    }
    if (!/^[A-Z0-9]{4,7}$/.test(placaLimpia)) {
      Alert.alert('Placa inválida', 'Escribe la placa de tu vehículo (ej: ABC123).');
      return;
    }

    try {
      setReserving(true);
      const response = await api.post('/api/reservas', {
        parqueadero_id: parqueaderoId,
        tipo_vehiculo: selectedType,
        placa: placaLimpia,
        servicio_lavado_id: selectedServicio,
      });
      setReserva(withLocalExpiry(response.data));
      setReserveModalVisible(false);
      fetchParqueadero();
      Alert.alert(
        '¡Celda reservada!',
        `Te guardamos la celda por ${RESERVA_MINUTOS} minutos. Si no llegas a tiempo, se libera sola.`
      );
    } catch (error) {
      console.error(error);
      Alert.alert('No se pudo reservar', getErrorMessage(error, 'Inténtalo de nuevo en un momento.'));
      fetchParqueadero();
      fetchMiReserva();
    } finally {
      setReserving(false);
    }
  };

  const cancelReserve = () => {
    Alert.alert('Cancelar reserva', '¿Seguro que quieres liberar la celda reservada?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          try {
            setCancelling(true);
            await api.put(`/api/reservas/${reserva.id}/cancelar`);
            setReserva(null);
            fetchParqueadero();
          } catch (error) {
            console.error(error);
            Alert.alert('Error', getErrorMessage(error, 'No se pudo cancelar la reserva'));
            fetchMiReserva();
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={() => navigation.navigate('Profile')}
        accessibilityLabel="Mi perfil"
      >
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

  const servicios = parqueadero.servicios_lavado || [];

  // Servicios de lavado del parqueadero (se pueden agregar a la reserva)
  const renderLavado = () =>
    servicios.length > 0 ? (
      <>
        <Text style={styles.sectionTitle}>LAVADO</Text>
        <View style={styles.washCard}>
          {servicios.map((servicio, index) => (
            <View key={servicio.id} style={[styles.washRow, index > 0 && styles.washRowBorder]}>
              <MaterialCommunityIcons name="car-wash" size={18} color="#FFD200" />
              <Text style={styles.washName} numberOfLines={1}>
                {servicio.nombre}
              </Text>
              <Text style={styles.washPrice}>{formatPrice(servicio.precio)}</Text>
            </View>
          ))}
          <Text style={styles.washHint}>Agrégalo al reservar tu celda</Text>
        </View>
      </>
    ) : null;

  // Opiniones de otros clientes
  const renderOpiniones = () => (
    <>
      <Text style={styles.sectionTitle}>OPINIONES</Text>
      {opiniones.length === 0 ? (
        <View style={styles.noOpinions}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color="#5A5A5E" />
          <Text style={styles.noOpinionsText}>Todavía nadie ha calificado este parqueadero</Text>
        </View>
      ) : (
        opiniones.slice(0, 5).map((opinion) => (
          <View key={opinion.id} style={styles.opinionCard}>
            <View style={styles.opinionTopRow}>
              <Text style={styles.opinionName}>{opinion.cliente_nombre}</Text>
              <StarRating value={opinion.estrellas} size={13} />
            </View>
            {opinion.comentario ? <Text style={styles.opinionText}>{opinion.comentario}</Text> : null}
          </View>
        ))
      )}
      <View style={{ height: 20 }} />
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
          // Mapa con el punto del parqueadero: al tocarlo se abre la app de mapas del celular
          <TouchableOpacity
            style={[styles.mapContainer, isWideLayout && styles.mapContainerWide]}
            onPress={() => openInMaps(getMapsTarget())}
            activeOpacity={0.8}
          >
            <ParkingMap
              style={StyleSheet.absoluteFill}
              interactive={false}
              markers={[
                {
                  id: parqueadero.id,
                  latitude: parseFloat(parqueadero.latitud),
                  longitude: parseFloat(parqueadero.longitud),
                  label: 'P',
                },
              ]}
            />
            <View style={styles.mapOpenBadge}>
              <Ionicons name="map" size={12} color="#000000" />
              <Text style={styles.mapOpenText}>VER EN MAPS</Text>
            </View>
            {distanceText ? (
              <View style={styles.mapDistanceBadge}>
                <Ionicons name="navigate" size={12} color="#FFD200" />
                <Text style={styles.mapDistanceText}>{distanceText}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
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

  // Tarjeta con la reserva del cliente en este parqueadero y su cuenta regresiva
  const renderReserva = () => {
    const remainingMs = reserva.expiraLocal - now.getTime();
    const almostOver = remainingMs < 5 * 60 * 1000;

    return (
      <View style={styles.reservaCard}>
        <View style={styles.reservaTopRow}>
          <MaterialCommunityIcons name="ticket-confirmation-outline" size={22} color="#FFD200" />
          <Text style={styles.reservaTitle}>TU RESERVA</Text>
        </View>
        <Text style={styles.reservaInfo}>
          {VEHICLE_SINGULAR[reserva.tipo_vehiculo]} · Placa {reserva.placa}
        </Text>
        {reserva.servicio_nombre ? (
          <Text style={styles.reservaWash}>
            Lavado: {reserva.servicio_nombre} · {formatPrice(reserva.servicio_precio)}
          </Text>
        ) : null}
        <View style={styles.reservaTimerRow}>
          <Text style={[styles.reservaTimer, almostOver && styles.reservaTimerWarning]}>
            {remainingMs > 0 ? formatCountdown(remainingMs) : '0:00'}
          </Text>
          <Text style={styles.reservaTimerLabel}>
            {remainingMs > 0 ? 'para llegar antes de que se libere' : 'La reserva está venciendo...'}
          </Text>
        </View>
        <Text style={styles.reservaHint}>Muestra tu placa al llegar al parqueadero.</Text>
      </View>
    );
  };

  const totalDisponibles = VEHICLE_TYPES.reduce(
    (sum, { key }) => sum + (parqueadero[`${key}_disponibles`] || 0),
    0
  );

  const renderBottomButton = () => {
    if (reservaAqui) {
      return (
        <TouchableOpacity
          style={[styles.cancelReserveButton, cancelling && styles.buttonDisabled]}
          onPress={cancelReserve}
          disabled={cancelling}
          activeOpacity={0.8}
        >
          {cancelling ? (
            <ActivityIndicator size="small" color="#FF5252" />
          ) : (
            <Text style={styles.cancelReserveButtonText}>CANCELAR RESERVA</Text>
          )}
        </TouchableOpacity>
      );
    }

    const sinCeldas = totalDisponibles <= 0;
    const cerrado = !estaAbiertoAhora(parqueadero);
    const label = reserva
      ? 'YA TIENES UNA RESERVA'
      : cerrado
      ? 'PARQUEADERO CERRADO'
      : sinCeldas
      ? 'SIN CELDAS LIBRES'
      : 'RESERVAR ESPACIO';
    return (
      <TouchableOpacity
        style={[styles.reserveButton, (sinCeldas || cerrado || reserva) && styles.buttonDisabled]}
        onPress={openReserveModal}
        disabled={(sinCeldas || cerrado) && !reserva}
        activeOpacity={0.8}
      >
        <Text style={styles.reserveButtonText}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const renderReserveModal = () => (
    <Modal
      animationType="fade"
      transparent
      visible={reserveModalVisible}
      onRequestClose={() => setReserveModalVisible(false)}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Reservar espacio</Text>
          <Text style={styles.modalSubtitle}>
            Te guardamos la celda {RESERVA_MINUTOS} minutos mientras llegas.
          </Text>

          <Text style={styles.modalLabel}>TIPO DE VEHÍCULO</Text>
          <View style={styles.typeRow}>
            {VEHICLE_TYPES.map(({ key, singular, icon, IconSet }) => {
              const libres = parqueadero[`${key}_disponibles`] || 0;
              const selected = selectedType === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.typeOption,
                    selected && styles.typeOptionSelected,
                    libres <= 0 && styles.buttonDisabled,
                  ]}
                  onPress={() => setSelectedType(key)}
                  disabled={libres <= 0}
                  activeOpacity={0.8}
                >
                  <IconSet name={icon} size={22} color={selected ? '#000000' : '#FFD200'} />
                  <Text style={[styles.typeOptionText, selected && styles.typeOptionTextSelected]}>
                    {singular}
                  </Text>
                  <Text style={[styles.typeOptionCount, selected && styles.typeOptionTextSelected]}>
                    {libres > 0 ? `${libres} libres` : 'Lleno'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.modalLabel}>PLACA</Text>
          <TextInput
            style={styles.modalInput}
            value={placa}
            onChangeText={(text) => setPlaca(text.toUpperCase())}
            placeholder="ABC123"
            placeholderTextColor="#5A5A5E"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
          />

          {servicios.length > 0 ? (
            <>
              <Text style={[styles.modalLabel, { marginTop: 18 }]}>LAVADO (OPCIONAL)</Text>
              <View style={styles.washOptions}>
                {[{ id: null, nombre: 'Sin lavado' }, ...servicios].map((servicio) => {
                  const selected = selectedServicio === servicio.id;
                  return (
                    <TouchableOpacity
                      key={servicio.id ?? 'ninguno'}
                      style={[styles.washOption, selected && styles.typeOptionSelected]}
                      onPress={() => setSelectedServicio(servicio.id)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[styles.washOptionText, selected && styles.typeOptionTextSelected]}
                        numberOfLines={1}
                      >
                        {servicio.nombre}
                      </Text>
                      {servicio.id ? (
                        <Text style={[styles.typeOptionCount, selected && styles.typeOptionTextSelected]}>
                          {formatPrice(servicio.precio)}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}

          {selectedType ? (
            <Text style={styles.modalPrice}>
              Precio: {formatPrice(parqueadero[`${selectedType}_precio`])} por hora
              {selectedServicio
                ? ` + lavado ${formatPrice(servicios.find((s) => s.id === selectedServicio)?.precio)}`
                : ''}
              , se paga en el parqueadero
            </Text>
          ) : null}

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setReserveModalVisible(false)}
              disabled={reserving}
            >
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalConfirmBtn, reserving && styles.buttonDisabled]}
              onPress={confirmReserve}
              disabled={reserving}
            >
              {reserving ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Text style={styles.modalConfirmText}>Reservar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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

        {/* Foto de la entrada */}
        {fotoUrl(parqueadero) ? (
          <Image source={{ uri: fotoUrl(parqueadero) }} style={styles.photo} resizeMode="cover" />
        ) : null}

        {/* Calificación y horario */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <StarRating value={Number(parqueadero.calificacion_promedio) || 0} size={14} />
            <Text style={styles.infoText}>
              {Number(parqueadero.calificaciones_total) > 0
                ? `${Number(parqueadero.calificacion_promedio).toFixed(1)} (${parqueadero.calificaciones_total})`
                : 'Sin opiniones'}
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="time-outline" size={15} color="#FFD200" />
            <Text style={styles.infoText}>{formatHorario(parqueadero)}</Text>
          </View>
        </View>

        {/* Indicador de sincronización en tiempo real */}
        <View style={styles.liveRow}>
          <View style={[styles.liveDot, syncError && styles.liveDotError]} />
          <Text style={styles.liveText}>
            {syncError
              ? `Sin conexión · datos de las ${lastUpdated ? formatTime(lastUpdated) : '--:--:--'}`
              : lastUpdated
              ? `En vivo · ${formatTime(now)}`
              : 'Sincronizando...'}
          </Text>
        </View>

        {!estaAbiertoAhora(parqueadero) ? (
          <View style={styles.closedBanner}>
            <Ionicons name="lock-closed" size={18} color="#FF5252" />
            <Text style={styles.closedBannerText}>{motivoCerrado(parqueadero)}. No recibe reservas.</Text>
          </View>
        ) : null}

        {reservaAqui ? renderReserva() : null}

        <View style={isWideLayout && styles.columns}>
          <View style={isWideLayout && styles.column}>
            {renderAvailability()}
            {renderPrices()}
            {renderLavado()}
          </View>
          <View style={isWideLayout && styles.column}>
            {renderLocation()}
            {renderOpiniones()}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomContainer, isTablet && styles.tabletPadding]}>
        {renderBottomButton()}
      </View>

      {renderReserveModal()}
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
    backgroundColor: '#0F0F11',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  mapContainerWide: {
    height: 180,
  },
  mapOpenBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFD200',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  mapOpenText: {
    color: '#FFD200',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
  mapCoordsText: {
    color: '#5A5A5E',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
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
  buttonDisabled: {
    opacity: 0.4,
  },
  cancelReserveButton: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FF5252',
    backgroundColor: '#1A0F0F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelReserveButtonText: {
    color: '#FF5252',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },

  // Foto, calificación y horario
  photo: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: '#161618',
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 10,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Lavado
  washCard: {
    backgroundColor: '#161618',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#262628',
    marginBottom: 20,
  },
  washRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  washRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#232325',
  },
  washName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  washPrice: {
    color: '#FFD200',
    fontSize: 14,
    fontWeight: 'bold',
  },
  washHint: {
    color: '#5A5A5E',
    fontSize: 11,
    paddingBottom: 6,
  },
  washOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  washOption: {
    flexGrow: 1,
    flexBasis: '45%',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3D3D20',
    backgroundColor: '#1F1F10',
    gap: 2,
  },
  washOptionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },

  // Opiniones
  noOpinions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 14,
  },
  noOpinionsText: {
    flex: 1,
    color: '#5A5A5E',
    fontSize: 13,
  },
  opinionCard: {
    backgroundColor: '#161618',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  opinionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  opinionName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  opinionText: {
    color: '#A0A0A0',
    fontSize: 13,
    marginTop: 6,
  },

  // Parqueadero cerrado
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A0F0F',
    borderWidth: 1,
    borderColor: '#4A1F1F',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  closedBannerText: {
    flex: 1,
    color: '#FF8A8A',
    fontSize: 13,
  },

  // Reserva activa
  reservaCard: {
    backgroundColor: '#1F1F10',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#FFD200',
    marginBottom: 20,
  },
  reservaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reservaTitle: {
    color: '#FFD200',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
  reservaInfo: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
  },
  reservaWash: {
    color: '#FFD200',
    fontSize: 13,
    marginTop: 4,
  },
  reservaTimerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 8,
  },
  reservaTimer: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  reservaTimerWarning: {
    color: '#FF9F0A',
  },
  reservaTimerLabel: {
    flex: 1,
    color: '#8E8E93',
    fontSize: 12,
  },
  reservaHint: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 6,
  },

  // Modal de reserva
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
    padding: 22,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8E8E93',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  typeOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3D3D20',
    backgroundColor: '#1F1F10',
    gap: 4,
  },
  typeOptionSelected: {
    backgroundColor: '#FFD200',
    borderColor: '#FFD200',
  },
  typeOptionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  typeOptionCount: {
    color: '#8E8E93',
    fontSize: 11,
  },
  typeOptionTextSelected: {
    color: '#000000',
  },
  modalInput: {
    backgroundColor: '#0F0F10',
    borderWidth: 1,
    borderColor: '#FFD200',
    borderRadius: 10,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 2,
    paddingHorizontal: 14,
    height: 50,
  },
  modalPrice: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 10,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 20,
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
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#FFD200',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 15,
  },
});

export default ParkingDetailScreen;
