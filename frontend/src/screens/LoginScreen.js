import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import api from '../services/api';
import { saveSession } from '../services/session';
import useResponsive from '../hooks/useResponsive';
import Field from '../components/Field';
import { colors } from '../theme';

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const { isTablet, isWideLayout } = useResponsive();

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Por favor, ingresa tu correo y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/api/auth/login', {
        correo: email.trim(),
        contrasena: password,
      });
      const { token, usuario } = response.data;

      await saveSession(token, usuario);

      if (usuario.rol === 'dueno_parqueadero') {
        navigation.replace('OwnerHome', { user: usuario });
      } else {
        navigation.replace('ClientHome', { user: usuario });
      }
    } catch (error) {
      console.error(error);
      const msg =
        error.response?.data?.mensaje ||
        'Credenciales incorrectas o error de conexión con el servidor.';
      Alert.alert('Error al iniciar sesión', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.contentWrapper,
              isTablet && styles.contentWrapperTablet,
              isWideLayout && styles.contentWrapperWide,
            ]}
          >
            {/* Logo y Encabezado */}
            <View style={[styles.headerContainer, isWideLayout && styles.headerContainerWide]}>
              <View style={styles.logoBadge}>
                <View style={styles.logoInnerBox}>
                  <Text style={styles.logoP}>P</Text>
                </View>
              </View>

              <Text style={styles.brandTitle}>PARKAPP</Text>
              <Text style={styles.brandSubtitle}>
                Gestión inteligente de parqueaderos
              </Text>
            </View>

            {/* Formulario */}
            <View style={[styles.formContainer, isWideLayout && styles.formContainerWide]}>
              {/* Campo Correo */}
              <Text style={styles.inputLabel}>CORREO ELECTRÓNICO</Text>
              <Field
                placeholder="propietario@parkapp.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Campo Contraseña */}
              <Text style={[styles.inputLabel, { marginTop: 18 }]}>CONTRASEÑA</Text>
              <Field
                placeholder="••••••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              >
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                  activeOpacity={0.7}
                  accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <Feather
                    name={showPassword ? 'eye' : 'eye-off'}
                    size={20}
                    color={colors.textMuted}
                  />
                </TouchableOpacity>
              </Field>

              {/* Fila Recordarme y Olvido Contraseña */}
              <View style={styles.optionsRow}>
                <TouchableOpacity
                  style={styles.rememberContainer}
                  onPress={() => setRememberMe(!rememberMe)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.checkbox,
                      rememberMe ? styles.checkboxChecked : styles.checkboxUnchecked,
                    ]}
                  >
                    {rememberMe && (
                      <Ionicons name="checkmark" size={14} color={colors.onPrimary} />
                    )}
                  </View>
                  <Text style={styles.rememberText}>Recordarme</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.navigate('ForgotPassword', { correo: email.trim() })}
                >
                  <Text style={styles.forgotPasswordText}>¿Olvidó contraseña?</Text>
                </TouchableOpacity>
              </View>

              {/* Botón Iniciar Sesión */}
              <TouchableOpacity
                style={[styles.loginButton, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.loginButtonText}>INICIAR SESIÓN</Text>
                )}
              </TouchableOpacity>

              {/* Pie de pantalla: Enlace a Registro */}
              <View style={styles.footerRow}>
                <Text style={styles.footerText}>¿No tienes una cuenta? </Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('Register')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.registerLink}>Crear cuenta</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 40,
    paddingBottom: 30,
  },
  contentWrapper: {
    width: '100%',
    alignSelf: 'center',
  },
  contentWrapperTablet: {
    paddingHorizontal: 40,
  },
  contentWrapperWide: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 36,
  },
  headerContainerWide: {
    flex: 1,
    marginBottom: 0,
    paddingRight: 40,
  },
  logoBadge: {
    width: 68,
    height: 68,
    backgroundColor: colors.primary,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  logoInnerBox: {
    width: 38,
    height: 38,
    borderWidth: 2.2,
    borderColor: colors.onPrimary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoP: {
    color: colors.onPrimary,
    fontSize: 22,
    fontWeight: '900',
  },
  brandTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 1.5,
  },
  brandSubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
  },
  formContainerWide: {
    flex: 1,
    width: undefined,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  eyeButton: {
    padding: 6,
    marginRight: -6,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  rememberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
  },
  checkboxUnchecked: {
    borderWidth: 1.5,
    borderColor: colors.placeholder,
    backgroundColor: colors.surfaceRaised,
  },
  rememberText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  forgotPasswordText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  loginButton: {
    backgroundColor: colors.primary,
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  loginButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  registerLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default LoginScreen;
