import React, { useCallback, useEffect, useState } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../services/api';
import useResponsive from '../hooks/useResponsive';
import useRealtime from '../hooks/useRealtime';
import StarRating from '../components/StarRating';
import { getStoredUser } from '../services/session';
import { VEHICLE_SINGULAR, getErrorMessage } from '../utils/reservas';
import { formatPrice } from '../utils/parqueadero';

const PERIODOS = [
  { dias: 1, label: 'Hoy' },
  { dias: 7, label: '7 días' },
  { dias: 30, label: '30 días' },
];

const ESTADOS = {
  completada: { label: 'Llegó', color: '#34C759' },
  cancelada: { label: 'Cancelada', color: '#8E8E93' },
  vencida: { label: 'Venció', color: '#FF9F0A' },
};

// "30 oct · 16:05"
const formatFecha = (valor) => {
  const fecha = new Date(valor);
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const pad = (n) => String(n).padStart(2, '0');
  return `${fecha.getDate()} ${meses[fecha.getMonth()]} · ${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`;
};

// Historial de reservas: el cliente califica las suyas; el dueño ve además un resumen del periodo
const HistoryScreen = ({ navigation }) => {
  const [user, setUser] = useState(null);
  const [dias, setDias] = useState(7);
  const [historial, setHistorial] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Calificar
  const [rating, setRating] = useState(null); // reserva que se está calificando
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');
  const [sendingRating, setSendingRating] = useState(false);

  const { isTablet } = useResponsive();
  const esDueno = user?.rol === 'dueno_parqueadero';

  useEffect(() => {
    getStoredUser().then(setUser);
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const params = esDueno ? `?dias=${dias}` : '';
      const [historialRes, resumenRes] = await Promise.all([
        api.get(`/api/reservas/historial${params}`),
        esDueno ? api.get(`/api/reservas/resumen?dias=${dias}`) : Promise.resolve(null),
      ]);
      setHistorial(historialRes.data);
      if (resumenRes) setResumen(resumenRes.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [user, esDueno, dias]);

  useEffect(() => {
    load();
  }, [load]);

  // Cuando una reserva cambia (llegó, venció...) el historial se actualiza solo
  useRealtime('reservas:actualizadas', load);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openRating = (reserva) => {
    setRating(reserva);
    setEstrellas(0);
    setComentario('');
  };

  const sendRating = async () => {
    if (!estrellas) {
      Alert.alert('Elige las estrellas', 'Toca de 1 a 5 estrellas.');
      return;
    }
    try {
      setSendingRating(true);
      const { data } = await api.post('/api/calificaciones', {
        reserva_id: rating.id,
        estrellas,
        comentario: comentario.trim() || null,
      });
      setRating(null);
      Alert.alert('¡Gracias!', data.mensaje);
      load();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', getErrorMessage(error, 'No se pudo guardar la calificación'));
    } finally {
      setSendingRating(false);
    }
  };

  const renderStat = (label, value, hint, icon) => (
    <View style={styles.statCard}>
      <View style={styles.statTop}>
        <MaterialCommunityIcons name={icon} size={16} color="#FFD200" />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );

  const renderResumen = () => (
    <>
      <View style={styles.periodRow}>
        {PERIODOS.map((p) => (
          <TouchableOpacity
            key={p.dias}
            style={[styles.periodChip, dias === p.dias && styles.periodChipActive]}
            onPress={() => setDias(p.dias)}
          >
            <Text style={[styles.periodText, dias === p.dias && styles.periodTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {resumen ? (
        <>
          <View style={styles.statsGrid}>
            {renderStat('Reservas', resumen.total, `${resumen.activas} activas ahora`, 'ticket-outline')}
            {renderStat(
              'Llegaron',
              resumen.completadas,
              resumen.tasa_llegada === null ? 'Sin reservas cerradas' : `${resumen.tasa_llegada}% de las reservas`,
              'check-circle-outline'
            )}
            {renderStat(
              'No llegaron',
              resumen.vencidas + resumen.canceladas,
              `${resumen.vencidas} vencidas · ${resumen.canceladas} canceladas`,
              'close-circle-outline'
            )}
            {renderStat('Lavados', resumen.lavados, formatPrice(resumen.ingresos_lavado), 'car-wash')}
            {renderStat(
              'Ingresos est.',
              formatPrice(resumen.ingresos_estimados),
              '1 hora de parqueo + lavado por llegada',
              'cash'
            )}
            {renderStat(
              'Calificación',
              resumen.calificacion_promedio === null ? '—' : `${resumen.calificacion_promedio} ★`,
              `${resumen.calificaciones_total} opiniones`,
              'star-outline'
            )}
          </View>
        </>
      ) : null}
    </>
  );

  const renderReserva = (reserva) => {
    const estado = ESTADOS[reserva.estado] || { label: reserva.estado, color: '#8E8E93' };
    return (
      <View key={reserva.id} style={styles.card}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {esDueno ? reserva.placa : reserva.parqueadero_nombre || 'Parqueadero'}
          </Text>
          <View style={[styles.estadoBadge, { borderColor: estado.color }]}>
            <Text style={[styles.estadoText, { color: estado.color }]}>{estado.label}</Text>
          </View>
        </View>
        <Text style={styles.cardDetail}>
          {VEHICLE_SINGULAR[reserva.tipo_vehiculo]} · {esDueno ? reserva.cliente_nombre : `Placa ${reserva.placa}`}
        </Text>
        {reserva.servicio_nombre ? (
          <Text style={styles.cardWash}>
            Lavado: {reserva.servicio_nombre} · {formatPrice(reserva.servicio_precio)}
          </Text>
        ) : null}
        <View style={styles.cardBottomRow}>
          <Text style={styles.cardDate}>{formatFecha(reserva.fecha_creacion)}</Text>
          {reserva.calificacion ? (
            <StarRating value={reserva.calificacion} size={14} />
          ) : !esDueno && reserva.estado === 'completada' ? (
            <TouchableOpacity style={styles.rateBtn} onPress={() => openRating(reserva)}>
              <Ionicons name="star" size={14} color="#000000" />
              <Text style={styles.rateBtnText}>CALIFICAR</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, isTablet && styles.tabletContent]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FFD200" colors={['#FFD200']} />
        }
      >
        <Text style={styles.title}>{esDueno ? 'Historial y Resumen' : 'Mis Reservas'}</Text>
        <Text style={styles.subtitle}>
          {esDueno
            ? 'Cómo le fue a tu parqueadero'
            : 'Califica los parqueaderos en los que estuviste para ayudar a otros clientes'}
        </Text>

        {esDueno ? renderResumen() : null}

        <Text style={styles.sectionTitle}>RESERVAS ANTERIORES</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#FFD200" style={{ marginTop: 30 }} />
        ) : historial.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="ticket-outline" size={40} color="#3A3A3C" />
            <Text style={styles.emptyText}>Todavía no hay reservas terminadas</Text>
          </View>
        ) : (
          historial.map(renderReserva)
        )}
      </ScrollView>

      {/* Calificar un parqueadero */}
      <Modal animationType="fade" transparent visible={!!rating} onRequestClose={() => setRating(null)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>¿Cómo te fue?</Text>
            <Text style={styles.modalSubtitle}>{rating?.parqueadero_nombre}</Text>
            <View style={styles.starsInput}>
              <StarRating value={estrellas} size={38} onChange={setEstrellas} gap={8} />
            </View>
            <TextInput
              style={styles.commentInput}
              value={comentario}
              onChangeText={setComentario}
              placeholder="Cuéntales a otros clientes (opcional)"
              placeholderTextColor="#5A5A5E"
              multiline
              maxLength={300}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRating(null)} disabled={sendingRating}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, sendingRating && { opacity: 0.6 }]}
                onPress={sendRating}
                disabled={sendingRating}
              >
                {sendingRating ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.modalSaveText}>Enviar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  tabletContent: {
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#A0A0A0',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 8,
  },

  // Resumen
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  periodChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3D3D20',
    backgroundColor: '#1F1F10',
    alignItems: 'center',
  },
  periodChipActive: {
    backgroundColor: '#FFD200',
    borderColor: '#FFD200',
  },
  periodText: {
    color: '#FFD200',
    fontWeight: 'bold',
    fontSize: 13,
  },
  periodTextActive: {
    color: '#000000',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#161618',
    borderRadius: 14,
    padding: 14,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statLabel: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 6,
  },
  statHint: {
    color: '#5A5A5E',
    fontSize: 11,
    marginTop: 2,
  },

  // Reservas
  card: {
    backgroundColor: '#161618',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  estadoBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  estadoText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  cardDetail: {
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 4,
  },
  cardWash: {
    color: '#FFD200',
    fontSize: 12,
    marginTop: 4,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  cardDate: {
    color: '#5A5A5E',
    fontSize: 12,
  },
  rateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFD200',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rateBtnText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: {
    color: '#5A5A5E',
    fontSize: 14,
  },

  // Modal calificar
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
  },
  starsInput: {
    alignItems: 'center',
    marginVertical: 20,
  },
  commentInput: {
    backgroundColor: '#0F0F10',
    borderWidth: 1,
    borderColor: '#3A3A3C',
    borderRadius: 10,
    color: '#FFFFFF',
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 18,
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
});

export default HistoryScreen;
