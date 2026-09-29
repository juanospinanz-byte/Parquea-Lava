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

const OwnerHomeScreen = ({ navigation, route }) => {
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
            <Text style={styles.logoP}>P</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.welcomeText}>Bienvenido,</Text>
            <Text style={styles.nameText}>{userName || 'Dueño'}</Text>
          </View>
          <TouchableOpacity style={styles.iconCircle} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={22} color="#FF5252" />
          </TouchableOpacity>
        </View>

        {/* Tag de Rol */}
        <View style={styles.roleTag}>
          <View style={styles.roleIndicator} />
          <Text style={styles.roleTagText}>PANEL DE DUEÑO DE PARQUEADERO</Text>
        </View>

        {/* Panel central */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="business" size={28} color="#FFD200" />
            <Text style={styles.cardTitle}>Gestión de Celdas y Parqueo</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Aquí podrás registrar tus celdas, verificar disponibilidad en tiempo
            real y administrar las tarifas para tus clientes.
          </Text>

          <View style={styles.statRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>--</Text>
              <Text style={styles.statLabel}>Celdas Totales</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: '#4CAF50' }]}>--</Text>
              <Text style={styles.statLabel}>Disponibles</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: '#FFD200' }]}>--</Text>
              <Text style={styles.statLabel}>Ocupadas</Text>
            </View>
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
  logoP: {
    color: '#000000',
    fontSize: 22,
    fontWeight: '900',
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
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#18181B',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 4,
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

export default OwnerHomeScreen;
