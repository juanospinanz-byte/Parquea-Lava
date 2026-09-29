import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

const ClientHomeScreen = ({ navigation, route }) => {
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const getUserData = async () => {
      if (route.params?.user?.nombre) {
        setUserName(route.params.user.nombre);
        setUserEmail(route.params.user.correo || '');
      } else {
        const userDataStr = await AsyncStorage.getItem('userData');
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          setUserName(userData.nombre);
          setUserEmail(userData.correo || '');
        }
      }
    };
    getUserData();
  }, []);

  const handleLogout = async () => {
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('userData');
    navigation.replace('Login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Ionicons name="car-sport" size={24} color="#000000" />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.welcomeText}>Bienvenido,</Text>
            <Text style={styles.nameText}>{userName || 'Cliente'}</Text>
          </View>
          <TouchableOpacity style={styles.iconCircle} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color="#FF5252" />
          </TouchableOpacity>
        </View>

        {/* Tag de Rol */}
        <View style={styles.roleTag}>
          <View style={styles.roleIndicator} />
          <Text style={styles.roleTagText}>PANEL DE USUARIO CLIENTE</Text>
        </View>

        {/* Panel central */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="map" size={28} color="#FFD200" />
            <Text style={styles.cardTitle}>Buscar y Reservar Parqueo</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Encuentra parqueaderos cercanos con celdas disponibles y servicios de
            lavado para tu vehículo en tiempo real.
          </Text>

          <View style={styles.searchPrompt}>
            <Ionicons name="search" size={20} color="#8E8E93" />
            <Text style={styles.searchPlaceholder}>Buscar ubicación o parqueadero...</Text>
          </View>
        </View>

        {/* Botón Cerrar Sesión */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="exit-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 20,
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFD200',
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 14,
    color: '#8E8E93',
  },
  nameText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161618',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#262628',
    marginBottom: 24,
  },
  roleIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFD200',
    marginRight: 10,
  },
  roleTagText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFD200',
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: '#101012',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#FFD200',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginLeft: 12,
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
    marginBottom: 20,
  },
  searchPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181B',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: '#2D2D30',
  },
  searchPlaceholder: {
    color: '#8E8E93',
    fontSize: 14,
    marginLeft: 10,
  },
  logoutButton: {
    backgroundColor: '#262628',
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ClientHomeScreen;
