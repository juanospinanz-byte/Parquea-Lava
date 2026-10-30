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

// Recuperar contraseña en dos pasos: 1) pedir un código al correo, 2) escribirlo con la nueva contraseña
const ForgotPasswordScreen = ({ navigation, route }) => {
  const [correo, setCorreo] = useState(route.params?.correo || '');
  const [codigo, setCodigo] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [visible, setVisible] = useState(false);
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [loading, setLoading] = useState(false);
  const { isTablet } = useResponsive();

  const pedirCodigo = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
      Alert.alert('Correo inválido', 'Escribe el correo con el que te registraste.');
      return;
    }
    try {
      setLoading(true);
      const { data } = await api.post('/api/auth/recuperar', { correo: correo.trim() });
      setCodigoEnviado(true);
      Alert.alert('Revisa tu correo', data.mensaje);
    } catch (error) {
      console.error(error);
      // 429: ya se envió un código hace menos de un minuto; se puede usar ese
      if (error.response?.status === 429) setCodigoEnviado(true);
      Alert.alert('Código', getErrorMessage(error, 'No se pudo enviar el código. Intenta más tarde.'));
    } finally {
      setLoading(false);
    }
  };

  const cambiarContrasena = async () => {
    if (!/^\d{6}$/.test(codigo.trim())) {
      Alert.alert('Código inválido', 'El código tiene 6 números.');
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
    try {
      setLoading(true);
      const { data } = await api.post('/api/auth/restablecer', {
        correo: correo.trim(),
        codigo: codigo.trim(),
        nueva,
      });
      Alert.alert('¡Listo!', data.mensaje, [{ text: 'Iniciar sesión', onPress: () => navigation.goBack() }]);
    } catch (error) {
      console.error(error);
      Alert.alert('No se pudo cambiar', getErrorMessage(error, 'Inténtalo de nuevo en un momento.'));
    } finally {
      setLoading(false);
    }
  };

  const renderPasswordInput = (value, onChangeText, placeholder) => (
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
      <TouchableOpacity style={styles.eyeBtn} onPress={() => setVisible((v) => !v)}>
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color="#8E8E93" />
      </TouchableOpacity>
    </View>
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
          <Text style={styles.title}>Recuperar Contraseña</Text>
          <Text style={styles.subtitle}>
            {codigoEnviado
              ? 'Escribe el código de 6 números que te enviamos y tu nueva contraseña.'
              : 'Te enviaremos un código a tu correo para que puedas crear una nueva contraseña.'}
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>CORREO ELECTRÓNICO</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={correo}
                onChangeText={setCorreo}
                placeholder="tu@correo.com"
                placeholderTextColor="#5A5A5E"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!codigoEnviado}
              />
            </View>
          </View>

          {codigoEnviado ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>CÓDIGO</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.input, styles.codeInput]}
                    value={codigo}
                    onChangeText={(text) => setCodigo(text.replace(/\D/g, ''))}
                    placeholder="000000"
                    placeholderTextColor="#5A5A5E"
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>NUEVA CONTRASEÑA</Text>
                {renderPasswordInput(nueva, setNueva, `Mínimo ${CONTRASENA_MIN} caracteres`)}
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>CONFIRMAR NUEVA CONTRASEÑA</Text>
                {renderPasswordInput(confirmacion, setConfirmacion, 'Repite la nueva contraseña')}
              </View>

              <TouchableOpacity onPress={pedirCodigo} disabled={loading} style={styles.linkBtn}>
                <Text style={styles.linkText}>¿No te llegó? Enviar otro código</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setCodigoEnviado(false);
                  setCodigo('');
                }}
                style={styles.linkBtn}
              >
                <Text style={styles.linkTextMuted}>Usar otro correo</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </ScrollView>

        <View style={[styles.bottomContainer, isTablet && styles.tabletContent]}>
          <TouchableOpacity
            style={[styles.saveButton, loading && styles.saveButtonDisabled]}
            onPress={codigoEnviado ? cambiarContrasena : pedirCodigo}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.saveButtonText}>{codigoEnviado ? 'CAMBIAR CONTRASEÑA' : 'ENVIAR CÓDIGO'}</Text>
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
  codeInput: {
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 8,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    height: '100%',
    justifyContent: 'center',
  },
  linkBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  linkText: {
    color: '#FFD200',
    fontSize: 13,
    fontWeight: '600',
  },
  linkTextMuted: {
    color: '#8E8E93',
    fontSize: 13,
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

export default ForgotPasswordScreen;
