import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import api from '../services/api';
import { hasValidCoords, geocodeAddress, openInMaps } from '../utils/maps';
import Field from '../components/Field';
import { colors } from '../theme';

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
  // Dirección a la que corresponden las coordenadas actuales (para no volver a buscarla)
  const [locatedAddress, setLocatedAddress] = useState(savedCoordsValid ? direccion.trim() : null);
  // true si las coordenadas salieron de la dirección escrita y el dueño aún no las revisó en Maps
  const [checkPending, setCheckPending] = useState(false);
  const [saving, setSaving] = useState(false);
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
      'La ubicación se calculó a partir de la dirección y puede ser aproximada. Ábrela en Maps para revisarla. Si no es la entrada de tu parqueadero, corrige la dirección.',
      [
        { text: 'Ver en Maps', onPress: () => showInMaps(point) },
        { text: 'Sí, es correcto', onPress: onConfirm },
      ]
    );
  };

  const applyGeocodeResult = (result) => {
    const point = { latitude: result.latitude, longitude: result.longitude };
    setCoords(point);
    setCheckPending(true);
    setDireccion(result.direccion);
    setLocatedAddress(result.direccion.trim());
    return { point, direccion: result.direccion };
  };

  // Busca la dirección escrita y devuelve el punto encontrado (o null si no se pudo)
  const locateAddress = async () => {
    if (!direccion.trim()) {
      Alert.alert('Campo requerido', 'Escribe la dirección para ubicarla.');
      return null;
    }
    const result = await geocodeAddress(direccion, coords || lastKnownRef.current);
    if (!result) {
      Alert.alert(
        'Dirección no encontrada',
        'No pudimos ubicar esa dirección. Incluye la ciudad (ej: "Ac. 24 #95a-80, Bogotá").'
      );
      return null;
    }
    return applyGeocodeResult(result);
  };

  const searchAddress = async () => {
    setSearchingAddress(true);
    const located = await locateAddress();
    setSearchingAddress(false);
    if (!located) return;
    Alert.alert(
      'Revisa la ubicación',
      `Ubicamos "${located.direccion}". Ábrela en Maps para confirmar que el punto sea tu parqueadero.`,
      [
        { text: 'Después', style: 'cancel' },
        { text: 'Ver en Maps', onPress: () => showInMaps(located.point) },
      ]
    );
  };

  const handleSave = async () => {
    if (!direccion.trim()) {
      Alert.alert('Campo requerido', 'Debes ingresar la dirección física del parqueadero.');
      return;
    }

    // Sin ubicación, o la dirección cambió desde que se ubicó: se toma la de la dirección escrita (y se pide revisarla)
    if (!coords || direccion.trim() !== locatedAddress) {
      setSaving(true);
      const result = await geocodeAddress(direccion, lastKnownRef.current);
      setSaving(false);
      if (!result) {
        Alert.alert(
          'Marca la ubicación',
          'No pudimos ubicar la dirección. Revísala e incluye la ciudad (ej: "Ac. 24 #95a-80, Bogotá").'
        );
        return;
      }
      const { point } = applyGeocodeResult(result);
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
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => navigation.navigate('Profile')}
          accessibilityLabel="Mi perfil"
        >
          <Ionicons name="person-outline" size={20} color={colors.text} />
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

          {/* Dirección Física */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              DIRECCIÓN FÍSICA <Text style={styles.required}>*</Text>
            </Text>
            <Field
              value={direccion}
              onChangeText={setDireccion}
              placeholder="Ac. 24 #95a-80, Bogotá"
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
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="search" size={16} color={colors.primary} />
                  <Text style={styles.searchAddressText}>UBICAR DIRECCIÓN</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Detalles Adicionales */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>DETALLES ADICIONALES</Text>
            <Field
              value={detalles}
              onChangeText={setDetalles}
              placeholder="Al lado del centro comercial"
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
              <ActivityIndicator size="small" color={colors.onPrimary} />
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
    backgroundColor: colors.bg,
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
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 20,
  },

  // Campos
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  required: {
    color: colors.danger,
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
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySoft,
  },
  searchAddressText: {
    color: colors.primary,
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
    backgroundColor: colors.primary,
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});

export default EditLocationScreen;
