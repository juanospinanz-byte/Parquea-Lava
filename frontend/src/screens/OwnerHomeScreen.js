import React, { useEffect, useState, useRef } from 'react';
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
  Platform,
  Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import api from '../services/api';
import useResponsive from '../hooks/useResponsive';

const OwnerHomeScreen = ({ navigation, route }) => {
  const [userName, setUserName] = useState('');
  const [parqueadero, setParqueadero] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isTablet, isWideLayout } = useResponsive();
  const tabletPadding = isTablet && styles.tabletPadding;

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingType, setEditingType] = useState(null); // 'motos', 'carros', 'camiones', 'direccion', 'ubicacion'
  
  // Edit Form State
  const [editDisponibles, setEditDisponibles] = useState('');
  const [editMax, setEditMax] = useState('');
  const [editPrecio, setEditPrecio] = useState('');
  const [editDireccion, setEditDireccion] = useState('');

  // US04: Location State
  const [editLatitud, setEditLatitud] = useState(null);
  const [editLongitud, setEditLongitud] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const mapRef = useRef(null);

  // Default location (Bogotá, Colombia)
  const DEFAULT_LOCATION = {
    latitude: 4.7110,
    longitude: -74.0721,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

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
      fetchParqueadero();
    };
    getUserData();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchParqueadero();
    }, [])
  );

  const fetchParqueadero = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/parqueadero/me');
      setParqueadero(response.data);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo cargar la información del parqueadero');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('userData');
    navigation.replace('Login');
  };

  const openEditModal = (type) => {
    setEditingType(type);
    if (type === 'direccion') {
      setEditDireccion(parqueadero.direccion || '');
    } else if (type === 'ubicacion') {
      // US04: abrir modal de ubicación con coordenadas actuales o default
      const lat = parqueadero.latitud ? parseFloat(parqueadero.latitud) : DEFAULT_LOCATION.latitude;
      const lng = parqueadero.longitud ? parseFloat(parqueadero.longitud) : DEFAULT_LOCATION.longitude;
      setEditLatitud(lat);
      setEditLongitud(lng);
      setEditDireccion(parqueadero.direccion || '');
    } else {
      setEditDisponibles(parqueadero[`${type}_disponibles`]?.toString() || '0');
      setEditMax(parqueadero[`${type}_max`]?.toString() || '0');
      setEditPrecio(parqueadero[`${type}_precio`]?.toString() || '0');
    }
    setModalVisible(true);
  };

  // US04: obtener ubicación actual del dispositivo
  const getCurrentLocation = async () => {
    try {
      setLocationLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Necesitamos acceso a tu ubicación para configurar el parqueadero.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setEditLatitud(location.coords.latitude);
      setEditLongitud(location.coords.longitude);

      // Animar mapa a nueva ubicación
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }, 1000);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudo obtener la ubicación actual');
    } finally {
      setLocationLoading(false);
    }
  };

  // US04: al tocar el mapa, mover marcador
  const handleMapPress = (event) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setEditLatitud(latitude);
    setEditLongitud(longitude);
  };

  const saveChanges = async () => {
    try {
      const payload = {};
      if (editingType === 'direccion') {
        payload.direccion = editDireccion;
      } else if (editingType === 'ubicacion') {
        // US04: guardar dirección + coordenadas
        payload.direccion = editDireccion;
        payload.latitud = editLatitud;
        payload.longitud = editLongitud;
      } else {
        payload[`${editingType}_disponibles`] = parseInt(editDisponibles) || 0;
        payload[`${editingType}_max`] = parseInt(editMax) || 0;
        payload[`${editingType}_precio`] = parseFloat(editPrecio) || 0;
      }

      const response = await api.put('/api/parqueadero/me', payload);
      setParqueadero(response.data);
      setModalVisible(false);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'No se pudieron guardar los cambios');
    }
  };

  const renderCellCard = (type, title, max, disponibles, precio, iconName, iconType = 'MaterialCommunityIcons') => {
    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <View style={styles.iconBox}>
            {iconType === 'MaterialCommunityIcons' ? (
              <MaterialCommunityIcons name={iconName} size={24} color="#FFD200" />
            ) : (
              <Ionicons name={iconName} size={24} color="#FFD200" />
            )}
          </View>
          <View style={styles.cardTextContainer}>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardSubtitle}>Máx: {max} | ${precio}/h</Text>
          </View>
        </View>

        <View style={styles.cardRight}>
          <View style={styles.availableBadge}>
            <Text style={styles.availableNumber}>{disponibles}</Text>
            <Text style={styles.availableText}>Disponibles</Text>
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(type)}>
            <MaterialCommunityIcons name="check-circle-outline" size={20} color="#000000" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // US04: renderizar la mini-vista del mapa en la pantalla principal
  const renderLocationSection = () => {
    const hasLocation = parqueadero.latitud && parqueadero.longitud;
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

          {/* Mini mapa preview */}
          {hasLocation ? (
            <View style={styles.mapPreviewContainer}>
              <MapView
                style={styles.mapPreview}
                initialRegion={{
                  latitude: lat,
                  longitude: lng,
                  latitudeDelta: 0.008,
                  longitudeDelta: 0.008,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
              >
                <Marker
                  coordinate={{ latitude: lat, longitude: lng }}
                  title={parqueadero.nombre || 'Mi Parqueadero'}
                  description={parqueadero.direccion}
                >
                  <View style={styles.markerContainer}>
                    <View style={styles.marker}>
                      <Ionicons name="car-sport" size={16} color="#000" />
                    </View>
                    <View style={styles.markerTail} />
                  </View>
                </Marker>
              </MapView>
              <View style={styles.mapOverlay}>
                <View style={styles.coordBadge}>
                  <Ionicons name="navigate" size={12} color="#FFD200" />
                  <Text style={styles.coordText}>
                    {lat.toFixed(4)}, {lng.toFixed(4)}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.noLocationContainer}>
              <Ionicons name="map-outline" size={40} color="#3A3A3C" />
              <Text style={styles.noLocationText}>
                No has configurado la ubicación visual
              </Text>
              <Text style={styles.noLocationSubtext}>
                Toca "Configurar Ubicación" para marcar tu parqueadero en el mapa
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

  // US04: renderizar el contenido del modal de ubicación
  const renderLocationModal = () => {
    return (
      <View style={styles.locationModalContent}>
        {/* Input de dirección */}
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Dirección exacta</Text>
          <TextInput
            style={styles.input}
            value={editDireccion}
            onChangeText={setEditDireccion}
            placeholder="Ej: Calle 123 #45-67, Barrio Centro"
            placeholderTextColor="#666"
          />
        </View>

        {/* Mapa interactivo */}
        <Text style={styles.inputLabel}>Selecciona la ubicación en el mapa</Text>
        <Text style={styles.mapHint}>Toca el mapa para mover el marcador</Text>
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              latitude: editLatitud || DEFAULT_LOCATION.latitude,
              longitude: editLongitud || DEFAULT_LOCATION.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            }}
            onPress={handleMapPress}
          >
            {editLatitud && editLongitud && (
              <Marker
                coordinate={{ latitude: editLatitud, longitude: editLongitud }}
                draggable
                onDragEnd={(e) => {
                  setEditLatitud(e.nativeEvent.coordinate.latitude);
                  setEditLongitud(e.nativeEvent.coordinate.longitude);
                }}
              >
                <View style={styles.markerContainer}>
                  <View style={styles.marker}>
                    <Ionicons name="car-sport" size={16} color="#000" />
                  </View>
                  <View style={styles.markerTail} />
                </View>
              </Marker>
            )}
          </MapView>

          {/* Botón GPS flotante */}
          <TouchableOpacity
            style={styles.gpsButton}
            onPress={getCurrentLocation}
            disabled={locationLoading}
          >
            {locationLoading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Ionicons name="locate" size={22} color="#000" />
            )}
          </TouchableOpacity>
        </View>

        {/* Coordenadas actuales */}
        {editLatitud && editLongitud && (
          <View style={styles.coordsRow}>
            <View style={styles.coordItem}>
              <Text style={styles.coordLabel}>Latitud</Text>
              <Text style={styles.coordValue}>{editLatitud.toFixed(6)}</Text>
            </View>
            <View style={styles.coordItem}>
              <Text style={styles.coordLabel}>Longitud</Text>
              <Text style={styles.coordValue}>{editLongitud.toFixed(6)}</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading || !parqueadero) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#FFD200" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      
      {/* Top Header */}
      <View style={[styles.header, tabletPadding]}>
        <View style={styles.parkappBadge}>
          <Text style={styles.parkappText}>PARKAPP</Text>
        </View>
        <TouchableOpacity style={styles.profileBadge} onPress={handleLogout}>
          <Ionicons name="person-outline" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, tabletPadding]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title Section */}
        <Text style={styles.mainTitle}>Mi Parqueadero</Text>
        <Text style={styles.mainSubtitle}>Administra las celdas disponibles en tiempo real</Text>

        <View style={isWideLayout && styles.columns}>
          <View style={isWideLayout && styles.column}>
            {/* Celdas Disponibles Section */}
            <Text style={styles.sectionTitle}>CELDAS DISPONIBLES</Text>
            
            {renderCellCard(
              'motos', 
              'Celdas Motos', 
              parqueadero.motos_max, 
              parqueadero.motos_disponibles,
              parqueadero.motos_precio,
              'motorbike'
            )}
            
            {renderCellCard(
              'carros', 
              'Celdas Carros', 
              parqueadero.carros_max, 
              parqueadero.carros_disponibles,
              parqueadero.carros_precio,
              'car-sport',
              'Ionicons'
            )}
            
            {renderCellCard(
              'camiones', 
              'Celdas Camiones', 
              parqueadero.camiones_max, 
              parqueadero.camiones_disponibles,
              parqueadero.camiones_precio,
              'truck-outline'
            )}
          </View>

          <View style={isWideLayout && styles.column}>
            {/* US04: Sección de Ubicación del Parqueadero */}
            {renderLocationSection()}

            {/* Botón Cerrar Sesión */}
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
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
          <View style={[
            styles.modalContent, 
            editingType === 'ubicacion' && styles.modalContentWide
          ]}>
            <Text style={styles.modalTitle}>
              {editingType === 'direccion' 
                ? 'Editar Dirección' 
                : editingType === 'ubicacion'
                  ? 'Configurar Ubicación'
                  : `Editar Celdas de ${editingType}`}
            </Text>

            {editingType === 'ubicacion' ? (
              renderLocationModal()
            ) : editingType === 'direccion' ? (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Dirección</Text>
                <TextInput
                  style={styles.input}
                  value={editDireccion}
                  onChangeText={setEditDireccion}
                  placeholderTextColor="#666"
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
                    keyboardType="numeric"
                    placeholderTextColor="#666"
                  />
                </View>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Capacidad Máxima</Text>
                  <TextInput
                    style={styles.input}
                    value={editMax}
                    onChangeText={setEditMax}
                    keyboardType="numeric"
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
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveChanges}>
                <Text style={styles.modalSaveText}>Guardar</Text>
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
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  availableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFD200',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 10,
  },
  availableNumber: {
    color: '#FFD200',
    fontWeight: 'bold',
    fontSize: 14,
    marginRight: 4,
  },
  availableText: {
    color: '#8E8E93',
    fontSize: 11,
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
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  mapPreview: {
    width: '100%',
    height: 160,
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
  modalContentWide: {
    maxWidth: 520,
    maxHeight: '90%',
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

  // US04: Modal de ubicación
  locationModalContent: {
    // contenedor del form de ubicación dentro del modal
  },
  mapHint: {
    fontSize: 11,
    color: '#5A5A5E',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  mapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFD200',
    height: 250,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  gpsButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
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
  coordsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  coordItem: {
    flex: 1,
    backgroundColor: '#0F0F10',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  coordLabel: {
    fontSize: 10,
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  coordValue: {
    fontSize: 14,
    color: '#FFD200',
    fontWeight: 'bold',
  },
});

export default OwnerHomeScreen;
