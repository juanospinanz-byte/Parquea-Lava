import React, { useEffect, useState } from 'react';
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
import api from '../services/api';
import useResponsive from '../hooks/useResponsive';
import { getStoredUser, updateStoredUser, logout } from '../services/session';
import { getErrorMessage } from '../utils/reservas';
import Field from '../components/Field';
import { colors } from '../theme';

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

  const renderOption = (icon, label, onPress, { danger = false, last = false } = {}) => (
    <TouchableOpacity style={[styles.option, last && styles.optionLast]} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.optionIcon, danger && styles.optionIconDanger]}>
        <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.primary} />
      </View>
      <Text style={[styles.optionText, danger && { color: colors.danger }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, isTablet && styles.tabletContent]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatar}>
            <Ionicons name="person" size={36} color={colors.onPrimary} />
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
                    <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.cityText}>{user.ciudad}</Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}

          <Text style={styles.fieldLabel}>NOMBRE</Text>
          <Field
            style={styles.nameField}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Tu nombre"
            autoCapitalize="words"
            maxLength={100}
          >
            {nombreCambio ? (
              <TouchableOpacity style={styles.saveBtn} onPress={saveName} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={styles.saveBtnText}>GUARDAR</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </Field>

          <View style={styles.options}>
            {renderOption(
              esDueno ? 'stats-chart-outline' : 'receipt-outline',
              esDueno ? 'Historial y resumen' : 'Mis reservas',
              () => navigation.navigate('History')
            )}
            {renderOption('key-outline', 'Cambiar contraseña', () => navigation.navigate('ChangePassword'))}
            {renderOption('exit-outline', 'Cerrar sesión', confirmLogout, { danger: true, last: true })}
          </View>
        </ScrollView>
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
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
  },
  email: {
    fontSize: 14,
    color: colors.textMuted,
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
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleText: {
    color: colors.primary,
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
    color: colors.textMuted,
    fontSize: 13,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  nameField: {
    paddingRight: 6,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 38,
    justifyContent: 'center',
  },
  saveBtnText: {
    color: colors.onPrimary,
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  options: {
    marginTop: 28,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionLast: {
    borderBottomWidth: 0,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionIconDanger: {
    backgroundColor: colors.dangerSoft,
  },
  optionText: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ProfileScreen;
