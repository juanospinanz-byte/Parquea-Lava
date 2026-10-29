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
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import api from '../services/api';
import { MAP_PROVIDER, hasValidCoords, geocodeAddress } from '../utils/maps';

const EditLocationScreen = ({ navigation, route }) => {
  const parqueadero = route.params?.parqueadero;

  // Solo para pintar el mapa mientras llega el GPS; nunca se guarda sin confirmar
  const FALLBACK_REGION = {
    latitude: 4.7110,
    longitude: -74.0721,
  };

  const savedCoordsValid = hasValidCoords(parqueadero);
  const initialLat = savedCoordsValid ? parseFloat(parqueadero.latitud) : FALLBACK_REGION.latitude;
  const initialLng = savedCoordsValid ? parseFloat(parqueadero.longitud) : FALLBACK_REGION.longitude;

  const [direccion, setDireccion] = useState(
    parqueadero?.direccion && parqueadero.direccion !== 'Sin dirección registrada'
      ? parqueadero.direccion
      : ''
  );
  const [detalles, setDetalles] = useState(parqueadero?.detalles_ubicacion || '');
  const [latitud, setLatitud] = useState(initialLat);
  const [longitud, setLongitud] = useState(initialLng);
  const [saving, setSaving] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  // true cuando el marcador fue puesto por GPS, búsqueda de dirección o a mano
  const [coordsConfirmed, setCoordsConfirmed] = useState(savedCoordsValid);
  const mapRef = useRef(null);

  const moveMarkerTo = (coords) => {
    setLatitud(coords.latitude);
    setLongitud(coords.longitude);
    setCoordsConfirmed(true);
    mapRef.current?.animateToRegion(
      { ...coords, latitudeDelta: 0.005, longitudeDelta: 0.005 },
      1000
    );
  };

  // Pedir ubicación al cargar si no hay coordenadas válidas guardadas
  useEffect(() => {
    if (!savedCoordsValid) {
      getCurrentLocation();
    }
  }, []);

  const searchAddressOnMap = async () => {
    if (!direccion.trim()) {
      Alert.alert('Campo requerido', 'Escribe la dirección para buscarla en el mapa.');
      return;
    }
    setSearchingAddress(true);
    const coords = await geocodeAddress(direccion);
    setSearchingAddress(false);
    if (coords) {
      moveMarkerTo(coords);
    } else {
      Alert.alert(
        'Dirección no encontrada',
        'No pudimos ubicar esa dirección. Incluye la ciudad (ej: "Cra 81c #49f-50, Medellín") o toca el mapa para marcarla.'
      );
    }
  };

  const getCurrentLocation = async () => {
    try {
      setLocationLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permiso denegado',
          'Necesitamos acceso a tu ubicación para configurar el parqueadero.'
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      moveMarkerTo({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo obtener la ubicación actual');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleMapPress = (event) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setLatitud(latitude);
    setLongitud(longitude);
    setCoordsConfirmed(true);
  };

  const handleSave = async () => {
    if (!direccion.trim()) {
      Alert.alert('Campo requerido', 'Debes ingresar la dirección física del parqueadero.');
      return;
    }

    try {
      setSaving(true);

      // Si el marcador nunca se ubicó, se toma la posición de la dirección escrita
      let coords = { latitude: latitud, longitude: longitud };
      if (!coordsConfirmed) {
        const geocoded = await geocodeAddress(direccion);
        if (!geocoded) {
          Alert.alert(
            'Marca la ubicación',
            'No pudimos ubicar la dirección en el mapa. Toca el mapa o usa el botón de GPS para marcar tu parqueadero.'
          );
          return;
        }
        coords = geocoded;
        moveMarkerTo(geocoded);
      }

      await api.put('/api/parqueadero/me', {
        direccion: direccion.trim(),
        detalles_ubicacion: detalles.trim() || null,
        latitud: coords.latitude,
        longitud: coords.longitude,
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

          {/* Mapa */}
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              provider={MAP_PROVIDER}
              style={styles.map}
              showsUserLocation
              initialRegion={{
                latitude: latitud,
                longitude: longitud,
                latitudeDelta: 0.008,
                longitudeDelta: 0.008,
              }}
              onPress={handleMapPress}
            >
              <Marker
                coordinate={{ latitude: latitud, longitude: longitud }}
                draggable
                onDragEnd={(e) => {
                  setLatitud(e.nativeEvent.coordinate.latitude);
                  setLongitud(e.nativeEvent.coordinate.longitude);
                  setCoordsConfirmed(true);
                }}
              >
                <View style={styles.markerContainer}>
                  <View style={styles.marker}>
                    <Ionicons name="location" size={16} color="#000" />
                  </View>
                  <View style={styles.markerTail} />
                </View>
              </Marker>
            </MapView>

            {/* Botón GPS */}
            <TouchableOpacity
              style={styles.gpsButton}
              onPress={getCurrentLocation}
              disabled={locationLoading}
            >
              {locationLoading ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Ionicons name="locate" size={20} color="#000" />
              )}
            </TouchableOpacity>
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
              placeholder="Cra 81c #49f-50, Medellín"
              placeholderTextColor="#5A5A5E"
              returnKeyType="search"
              onSubmitEditing={searchAddressOnMap}
            />
            <TouchableOpacity
              style={styles.searchAddressBtn}
              onPress={searchAddressOnMap}
              disabled={searchingAddress}
              activeOpacity={0.8}
            >
              {searchingAddress ? (
                <ActivityIndicator size="small" color="#FFD200" />
              ) : (
                <>
                  <Ionicons name="search" size={16} color="#FFD200" />
                  <Text style={styles.searchAddressText}>UBICAR DIRECCIÓN EN EL MAPA</Text>
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

  // Mapa
  mapContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    height: 200,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  gpsButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFD200',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  markerContainer: {
    alignItems: 'center',
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFD200',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },
  markerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFD200',
    marginTop: -2,
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

