import React, { useState } from 'react';
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
import { getErrorMessage } from '../utils/reservas';
import Field from '../components/Field';
import { colors } from '../theme';

// Debe coincidir con el mínimo del backend (auth.controller.js)
const CONTRASENA_MIN = 6;

const PasswordField = ({ label, value, onChangeText, visible, onToggleVisible, placeholder }) => (
  <View style={styles.fieldGroup}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Field
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
    >
      <TouchableOpacity
        style={styles.eyeBtn}
        onPress={onToggleVisible}
        accessibilityLabel={visible ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </Field>
  </View>
);

const ChangePasswordScreen = ({ navigation }) => {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const { isTablet } = useResponsive();

  const handleSave = async () => {
    if (!actual || !nueva || !confirmacion) {
      Alert.alert('Campos requeridos', 'Completa los tres campos.');
      return;
    }
    if (nueva.length < CONTRASENA_MIN) {
      Alert.alert('Contraseña débil', `La nueva contraseña debe tener al menos ${CONTRASENA_MIN} caracteres.`);
      return;
    }
    if (nueva !== confirmacion) {
      Alert.alert('No coinciden', 'La nueva contraseña y su confirmación no son iguales.');
      return;
    }
    if (nueva === actual) {
      Alert.alert('Misma contraseña', 'La nueva contraseña debe ser diferente a la actual.');
      return;
    }

    try {
      setSaving(true);
      await api.put('/api/auth/contrasena', { actual, nueva });
      Alert.alert('¡Listo!', 'Tu contraseña se cambió correctamente.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error(error);
      Alert.alert('No se pudo cambiar', getErrorMessage(error, 'Inténtalo de nuevo en un momento.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, isTablet && styles.tabletContent]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Cambiar Contraseña</Text>
          <Text style={styles.subtitle}>Por seguridad, primero escribe tu contraseña actual</Text>

          <PasswordField
            label="CONTRASEÑA ACTUAL"
            value={actual}
            onChangeText={setActual}
            visible={visible}
            onToggleVisible={() => setVisible((v) => !v)}
            placeholder="••••••••"
          />
          <PasswordField
            label="NUEVA CONTRASEÑA"
            value={nueva}
            onChangeText={setNueva}
            visible={visible}
            onToggleVisible={() => setVisible((v) => !v)}
            placeholder={`Mínimo ${CONTRASENA_MIN} caracteres`}
          />
          <PasswordField
            label="CONFIRMAR NUEVA CONTRASEÑA"
            value={confirmacion}
            onChangeText={setConfirmacion}
            visible={visible}
            onToggleVisible={() => setVisible((v) => !v)}
            placeholder="Repite la nueva contraseña"
          />
        </ScrollView>

        <View style={[styles.bottomContainer, isTablet && styles.tabletContent]}>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={styles.saveButtonText}>GUARDAR CONTRASEÑA</Text>
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
    paddingBottom: 20,
  },
  tabletContent: {
    paddingHorizontal: 40,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
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
    marginBottom: 24,
  },
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
  eyeBtn: {
    padding: 6,
    marginRight: -6,
  },
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

export default ChangePasswordScreen;
