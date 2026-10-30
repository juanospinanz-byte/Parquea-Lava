import React, { useState } from 'react';
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
import { getErrorMessage } from '../utils/reservas';

// Debe coincidir con el mínimo del backend (auth.controller.js)
const CONTRASENA_MIN = 6;

const PasswordField = ({ label, value, onChangeText, visible, onToggleVisible, placeholder }) => (
  <View style={styles.fieldGroup}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.inputRow}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#5A5A5E"
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity style={styles.eyeBtn} onPress={onToggleVisible}>
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color="#8E8E93" />
      </TouchableOpacity>
    </View>
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
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
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
              <ActivityIndicator size="small" color="#000" />
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
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 24,
  },
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1.5,
    borderColor: '#FFD200',
    borderRadius: 12,
    height: 52,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    paddingHorizontal: 16,
    height: '100%',
  },
  eyeBtn: {
    paddingHorizontal: 14,
    height: '100%',
    justifyContent: 'center',
  },
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

export default ChangePasswordScreen;
