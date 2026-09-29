import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../services/api';

const OwnerHomeScreen = ({ navigation, route }) => {
  const [userName, setUserName] = useState('');
  const [parqueadero, setParqueadero] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingType, setEditingType] = useState(null); // 'motos', 'carros', 'camiones', 'direccion'
  
  // Edit Form State
  const [editDisponibles, setEditDisponibles] = useState('');
  const [editMax, setEditMax] = useState('');
  const [editPrecio, setEditPrecio] = useState('');
  const [editDireccion, setEditDireccion] = useState('');

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
    } else {
      setEditDisponibles(parqueadero[`${type}_disponibles`]?.toString() || '0');
      setEditMax(parqueadero[`${type}_max`]?.toString() || '0');
      setEditPrecio(parqueadero[`${type}_precio`]?.toString() || '0');
    }
    setModalVisible(true);
  };

  const saveChanges = async () => {
    try {
      const payload = {};
      if (editingType === 'direccion') {
        payload.direccion = editDireccion;
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
      <View style={styles.header}>
        <View style={styles.parkappBadge}>
          <Text style={styles.parkappText}>PARKAPP</Text>
        </View>
        <TouchableOpacity style={styles.profileBadge} onPress={handleLogout}>
          <Ionicons name="person-outline" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Title Section */}
        <Text style={styles.mainTitle}>Mi Parqueadero</Text>
        <Text style={styles.mainSubtitle}>Administra las celdas disponibles en tiempo real</Text>

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

        {/* Dirección Section */}
        <Text style={[styles.sectionTitle, { marginTop: 10 }]}>DIRECCIÓN DEL PARQUEADERO</Text>
        
        <View style={styles.addressCard}>
          <View style={styles.addressRow}>
            <Ionicons name="location-outline" size={20} color="#FFD200" />
            <Text style={styles.addressText}>{parqueadero.direccion}</Text>
          </View>
          <TouchableOpacity 
            style={styles.editAddressBtn}
            onPress={() => openEditModal('direccion')}
          >
            <Text style={styles.editAddressText}>EDITAR DIRECCIÓN</Text>
          </TouchableOpacity>
        </View>

        {/* Botón Cerrar Sesión */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="exit-outline" size={20} color="#FF5252" style={{ marginRight: 8 }} />
          <Text style={styles.logoutButtonText}>CERRAR SESIÓN</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} /> {/* Espacio extra al final */}
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
              {editingType === 'direccion' ? 'Editar Dirección' : `Editar Celdas de ${editingType}`}
            </Text>

            {editingType === 'direccion' ? (
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
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
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
  addressCard: {
    backgroundColor: '#161618',
    borderRadius: 16,
    padding: 16,
    marginBottom: 30,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  addressText: {
    color: '#FFFFFF',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  editAddressBtn: {
    borderWidth: 1,
    borderColor: '#2C2C2E',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editAddressText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
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
});

export default OwnerHomeScreen;
