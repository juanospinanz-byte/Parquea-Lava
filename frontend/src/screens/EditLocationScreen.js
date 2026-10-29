import React, { useState, useRef, useEffect } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import api from '../services/api';
import { hasValidCoords, geocodeAddress, openInMaps, ensureLocationPermission } from '../utils/maps';

// De dónde salieron las coordenadas que se van a guardar
const SOURCE_LABELS = {
  saved: 'Ubicación guardada',
  gps: 'GPS · ubicación actual del celular',
  address: 'Desde la dirección · aproximada',
};

const EditLocationScreen = ({ navigation, route }) => {
  const parqueadero = route.params?.parqueadero;
  const savedCoordsValid = hasValidCoords(parqueadero);

  const [direccion, setDireccion] = useState(
    parqueadero?.direccion && parqueadero.direccion !== 'Sin dirección registrada'
      ? parqueadero.direccion
      : ''
  );
  const [detalles, setDetalles] = useState(parqueadero?.detalles_ubicacion || '');
  const [coords, setCoords] = useState(
    savedCoordsValid
      ? { latitude: parseFloat(parqueadero.latitud), longitude: parseFloat(parqueadero.longitud) }
      : null
  );
  const [coordsSource, setCoordsSource] = useState(savedCoordsValid ? 'saved' : null);
  // true si las coordenadas salieron de la dirección escrita y el dueño aún no las revisó en Maps
  const [checkPending, setCheckPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  // Última posición conocida del celular: solo sirve para deducir la ciudad de la dirección
  const lastKnownRef = useRef(null);

  const label = parqueadero?.nombre || 'Mi parqueadero';

  // Sin pedir permiso: si ya lo dio, se usa su última posición para saber en qué ciudad está
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const last = await Location.getLastKnownPositionAsync();
        if (last) lastKnownRef.current = last.coords;
      } catch (e) {
        // No es necesario: sin esto la dirección solo debe incluir la ciudad
      }
    })();
  }, []);

  const showInMaps = (point = coords) => openInMaps({ ...point, label });

  const askToCheckInMaps = (point, onConfirm) => {
    Alert.alert(
      '¿El punto es tu parqueadero?',
      'La ubicación se calculó a partir de la dirección y puede ser aproximada. Ábrela en Maps para revisarla. Si no es la entrada de tu parqueadero, usa el GPS estando allí.',
      [
        { text: 'Ver en Maps', onPress: () => showInMaps(point) },
        { text: 'Sí, es correcto', onPress: onConfirm },
      ]
    );
  };

  const applyGeocodeResult = (result) => {
    const point = { latitude: result.latitude, longitude: result.longitude };
    setCoords(point);
    setCoordsSource('address');
    setCheckPending(true);
    setDireccion(result.direccion);
    return point;
  };

  const searchAddress = async () => {
    if (!direccion.trim()) {
      Alert.alert('Campo requerido', 'Escribe la dirección para ubicarla.');
      return;
    }
    setSearchingAddress(true);
    const result = await geocodeAddress(direccion, coords || lastKnownRef.current);
    setSearchingAddress(false);
    if (!result) {
      Alert.alert(
        'Dirección no encontrada',
        'No pudimos ubicar esa dirección. Incluye la ciudad (ej: "Ac. 24 #95a-80, Bogotá") o usa el GPS estando en el parqueadero.'
      );
      return;
    }
    const point = applyGeocodeResult(result);
    Alert.alert(
      'Revisa la ubicación',
      `Ubicamos "${result.direccion}". Ábrela en Maps para confirmar que el punto sea tu parqueadero.`,
      [
        { text: 'Después', style: 'cancel' },
        { text: 'Ver en Maps', onPress: () => showInMaps(point) },
      ]
    );
  };

  const getCurrentLocation = async () => {
    try {
      setLocationLoading(true);
      if (!(await ensureLocationPermission())) return;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setCoords({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      setCoordsSource('gps');
      setCheckPending(false);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo obtener la ubicación actual');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleSave = async () => {
    if (!direccion.trim()) {
      Alert.alert('Campo requerido', 'Debes ingresar la dirección física del parqueadero.');
      return;
    }

    // Si no hay ubicación, se toma la de la dirección escrita (y se pide revisarla)
    if (!coords) {
      setSaving(true);
      const result = await geocodeAddress(direccion, lastKnownRef.current);
      setSaving(false);
      if (!result) {
        Alert.alert(
          'Marca la ubicación',
          'No pudimos ubicar la dirección. Usa el botón "Usar mi ubicación" estando en el parqueadero.'
        );
        return;
      }
      const point = applyGeocodeResult(result);
      askToCheckInMaps(point, () => {
        setCheckPending(false);
        saveLocation(point, result.direccion);
      });
      return;
    }

    if (checkPending) {
      askToCheckInMaps(coords, () => {
        setCheckPending(false);
        saveLocation(coords, direccion);
      });
      return;
    }

    saveLocation(coords, direccion);
  };

  const saveLocation = async (point, address) => {
    try {
      setSaving(true);

      await api.put('/api/parqueadero/me', {
        direccion: address.trim(),
        detalles_ubicacion: detalles.trim() || null,
        latitud: point.latitude,
        longitud: point.longitude,
      });

      Alert.alert('¡Listo!', 'La dirección se guardó correctamente.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo guardar la dirección');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.profileBtn}>
          <Ionicons name="person-outline" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Título */}
          <Text style={styles.title}>Editar Dirección</Text>
          <Text style={styles.subtitle}>Ubica tu parqueadero para los clientes</Text>

          {/* Ubicación: se revisa en la app de mapas del celular */}
          <View style={[styles.locationCard, checkPending && styles.locationCardWarning]}>
            {coords ? (
              <>
                <View style={styles.locationRow}>
                  <Ionicons name="location" size={22} color="#FFD200" />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.locationSource, checkPending && styles.locationSourceWarning]}>
                      {SOURCE_LABELS[coordsSource]}
                    </Text>
                    <Text style={styles.locationCoords}>
                      {coords.latitude.toFixed(6)}, {coords.longitude.toFixed(6)}
                    </Text>
                  </View>
                </View>
                {checkPending && (
                  <Text style={styles.locationHint}>
                    Revisa en Maps que el punto sea la entrada de tu parqueadero. Si no lo es, usa el GPS estando allí.
                  </Text>
                )}
              </>
            ) : (
              <View style={styles.locationRow}>
                <Ionicons name="map-outline" size={22} color="#5A5A5E" />
                <Text style={styles.locationEmpty}>
                  Aún no has marcado la ubicación. Usa el GPS estando en el parqueadero o ubica la dirección.
                </Text>
              </View>
            )}

            <View style={styles.locationButtons}>
              <TouchableOpacity
                style={styles.gpsButton}
                onPress={getCurrentLocation}
                disabled={locationLoading}
                activeOpacity={0.8}
              >
                {locationLoading ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <>
                    <Ionicons name="locate" size={16} color="#000" />
                    <Text style={styles.gpsButtonText}>USAR MI UBICACIÓN</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mapsButton, !coords && styles.buttonDisabled]}
                onPress={() => showInMaps()}
                disabled={!coords}
                activeOpacity={0.8}
              >
                <Ionicons name="map-outline" size={16} color="#FFD200" />
                <Text style={styles.mapsButtonText}>VER EN MAPS</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Dirección Física */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              DIRECCIÓN FÍSICA <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={direccion}
              onChangeText={setDireccion}
              placeholder="Ac. 24 #95a-80, Bogotá"
              placeholderTextColor="#5A5A5E"
              returnKeyType="search"
              onSubmitEditing={searchAddress}
            />
            <TouchableOpacity
              style={styles.searchAddressBtn}
              onPress={searchAddress}
              disabled={searchingAddress}
              activeOpacity={0.8}
            >
              {searchingAddress ? (
                <ActivityIndicator size="small" color="#FFD200" />
              ) : (
                <>
                  <Ionicons name="search" size={16} color="#FFD200" />
                  <Text style={styles.searchAddressText}>UBICAR DIRECCIÓN</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Detalles Adicionales */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>DETALLES ADICIONALES</Text>
            <TextInput
              style={styles.input}
              value={detalles}
              onChangeText={setDetalles}
              placeholder="Al lado del centro comercial"
              placeholderTextColor="#5A5A5E"
            />
          </View>
        </ScrollView>

        {/* Botón Guardar */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.saveButtonText}>GUARDAR DIRECCIÓN</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileBtn: {
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

  // Ubicación
  locationCard: {
    borderRadius: 16,
    marginBottom: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    backgroundColor: '#1C1C1E',
    gap: 12,
  },
  locationCardWarning: {
    borderColor: '#FF9F0A',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationSource: {
    color: '#30D158',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  locationSourceWarning: {
    color: '#FF9F0A',
  },
  locationCoords: {
    color: '#FFFFFF',
    fontSize: 15,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  locationHint: {
    color: '#FF9F0A',
    fontSize: 12,
  },
  locationEmpty: {
    flex: 1,
    marginLeft: 10,
    color: '#8E8E93',
    fontSize: 13,
  },
  locationButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  gpsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFD200',
  },
  gpsButtonText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  mapsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3D3D20',
    backgroundColor: '#1F1F10',
  },
  mapsButtonText: {
    color: '#FFD200',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  buttonDisabled: {
    opacity: 0.4,
  },

  // Campos
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8E8E93',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  required: {
    color: '#FF5252',
  },
  input: {
    backgroundColor: '#1C1C1E',
    borderWidth: 1.5,
    borderColor: '#FFD200',
    borderRadius: 12,
    color: '#FFFFFF',
    fontSize: 15,
    paddingHorizontal: 16,
    height: 52,
  },
  searchAddressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3D3D20',
    backgroundColor: '#1F1F10',
  },
  searchAddressText: {
    color: '#FFD200',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },

  // Botón guardar
  bottomContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 10,
  },
  saveButton: {
    backgroundColor: '#FFD200',
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});

export default EditLocationScreen;
