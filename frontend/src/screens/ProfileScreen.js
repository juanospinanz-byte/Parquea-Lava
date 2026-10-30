import React, { useEffect, useState } from 'react';
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
import api from '../services/api';
import useResponsive from '../hooks/useResponsive';
import { getStoredUser, updateStoredUser, logout } from '../services/session';
import { getErrorMessage } from '../utils/reservas';

// Mi perfil (cliente y dueño): cambiar el nombre y accesos a contraseña, historial y cerrar sesión
const ProfileScreen = ({ navigation }) => {
  const [user, setUser] = useState(null);
  const [nombre, setNombre] = useState('');
  const [saving, setSaving] = useState(false);
  const { isTablet } = useResponsive();

  useEffect(() => {
    getStoredUser().then((stored) => {
      setUser(stored);
      setNombre(stored?.nombre || '');
    });
  }, []);

  const esDueno = user?.rol === 'dueno_parqueadero';
  const nombreCambio = user && nombre.trim() && nombre.trim() !== user.nombre;

  const saveName = async () => {
    if (!nombre.trim()) {
      Alert.alert('Nombre requerido', 'Escribe tu nombre.');
      return;
    }
    try {
      setSaving(true);
      const { data } = await api.put('/api/auth/perfil', { nombre: nombre.trim() });
      setUser(await updateStoredUser({ nombre: data.usuario.nombre }));
      Alert.alert('¡Listo!', 'Tu nombre se actualizó.');
    } catch (error) {
      console.error(error);
      Alert.alert('Error', getErrorMessage(error, 'No se pudo guardar el nombre'));
    } finally {
      setSaving(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => logout(navigation) },
    ]);
  };

  const renderOption = (icon, label, onPress, color = '#FFFFFF') => (
    <TouchableOpacity style={styles.option} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={icon} size={20} color={color === '#FFFFFF' ? '#FFD200' : color} />
      <Text style={[styles.optionText, { color }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#5A5A5E" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, isTablet && styles.tabletContent]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatar}>
            <Ionicons name="person" size={36} color="#000000" />
          </View>
          <Text style={styles.title}>Mi Perfil</Text>
          {user ? (
            <>
              <Text style={styles.email}>{user.correo}</Text>
              <View style={styles.roleRow}>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>{esDueno ? 'DUEÑO DE PARQUEADERO' : 'CLIENTE'}</Text>
                </View>
                {user.ciudad ? (
                  <View style={styles.cityRow}>
                    <Ionicons name="location-outline" size={14} color="#8E8E93" />
                    <Text style={styles.cityText}>{user.ciudad}</Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          <Text style={styles.fieldLabel}>NOMBRE</Text>
          <View style={styles.nameRow}>
            <TextInput
              style={styles.input}
              value={nombre}
              onChangeText={setNombre}
              placeholder="Tu nombre"
              placeholderTextColor="#5A5A5E"
              autoCapitalize="words"
              maxLength={100}
            />
            {nombreCambio ? (
              <TouchableOpacity style={styles.saveBtn} onPress={saveName} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <Text style={styles.saveBtnText}>GUARDAR</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.options}>
            {renderOption(
              esDueno ? 'stats-chart-outline' : 'receipt-outline',
              esDueno ? 'Historial y resumen' : 'Mis reservas',
              () => navigation.navigate('History')
            )}
            {renderOption('key-outline', 'Cambiar contraseña', () => navigation.navigate('ChangePassword'))}
            {renderOption('exit-outline', 'Cerrar sesión', confirmLogout, '#FF5252')}
          </View>
        </ScrollView>
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
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFD200',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  email: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
  },
  roleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    marginBottom: 28,
  },
  roleBadge: {
    backgroundColor: '#1F1F10',
    borderWidth: 1,
    borderColor: '#3D3D20',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleText: {
    color: '#FFD200',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cityText: {
    color: '#8E8E93',
    fontSize: 13,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8E8E93',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1.5,
    borderColor: '#FFD200',
    borderRadius: 12,
    height: 52,
    paddingRight: 6,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingHorizontal: 16,
    height: '100%',
  },
  saveBtn: {
    backgroundColor: '#FFD200',
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 38,
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  options: {
    marginTop: 28,
    backgroundColor: '#161618',
    borderRadius: 16,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#232325',
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ProfileScreen;
