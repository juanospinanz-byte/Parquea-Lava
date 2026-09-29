import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, Feather } from '@expo/vector-icons';
import api from '../services/api';

const RegisterScreen = ({ navigation }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState('dueno_parqueadero'); // default as shown in screenshot
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      Alert.alert('Campos requeridos', 'Por favor, completa todos los campos marcados con *');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Contraseña débil', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/api/auth/register', {
        nombre: name.trim(),
        correo: email.trim(),
        contrasena: password,
        rol: role,
      });

      const { token, usuario } = response.data;

      await AsyncStorage.setItem('userToken', token);
      await AsyncStorage.setItem('userData', JSON.stringify(usuario));

      if (usuario.rol === 'dueno_parqueadero') {
        navigation.replace('OwnerHome', { user: usuario });
      } else {
        navigation.replace('ClientHome', { user: usuario });
      }
    } catch (error) {
      console.error(error);
      const msg =
        error.response?.data?.mensaje ||
        'No se pudo completar el registro. Verifica los datos o intenta más tarde.';
      Alert.alert('Error al registrarse', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Barra superior con navegación e icono de perfil */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.profileBadge}>
              <Ionicons name="person-outline" size={20} color="#8E8E93" />
            </View>
          </View>

          {/* Título de pantalla */}
          <Text style={styles.title}>Crear Cuenta</Text>
          <Text style={styles.subtitle}>Únete a la red de parqueo más grande</Text>

          {/* Formulario */}
          <View style={styles.formContainer}>
            {/* Campo Nombre */}
            <Text style={styles.label}>
              NOMBRE COMPLETO <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                placeholder="Carlos Mendoza"
                placeholderTextColor="#666666"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            {/* Campo Correo */}
            <Text style={[styles.label, { marginTop: 18 }]}>
              CORREO ELECTRÓNICO <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                placeholder="carlos@mendoza.com"
                placeholderTextColor="#666666"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Campo Contraseña */}
            <Text style={[styles.label, { marginTop: 18 }]}>
              CONTRASEÑA <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[styles.textInput, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor="#666666"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
                activeOpacity={0.7}
              >
                <Feather
                  name={showPassword ? 'eye' : 'eye-off'}
                  size={20}
                  color="#888888"
                />
              </TouchableOpacity>
            </View>

            {/* Selector de Perfil / Rol */}
            <Text style={[styles.label, { marginTop: 22, marginBottom: 12 }]}>
              SELECCIONA TU PERFIL
            </Text>

            <View style={styles.rolesRow}>
              {/* Tarjeta Dueño de Parqueadero */}
              <TouchableOpacity
                style={[
                  styles.roleCard,
                  role === 'dueno_parqueadero'
                    ? styles.roleCardActive
                    : styles.roleCardInactive,
                ]}
                onPress={() => setRole('dueno_parqueadero')}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.roleIconBox,
                    role === 'dueno_parqueadero'
                      ? styles.roleIconBoxActive
                      : styles.roleIconBoxInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.roleIconTextP,
                      {
                        color:
                          role === 'dueno_parqueadero' ? '#000000' : '#FFD200',
                      },
                    ]}
                  >
                    P
                  </Text>
                </View>
                <Text style={styles.roleTitle}>Dueño de{'\n'}Parqueadero</Text>
                <Text style={styles.roleDescription}>
                  Quiero registrar y administrar mis celdas
                </Text>
              </TouchableOpacity>

              {/* Tarjeta Usuario Cliente */}
              <TouchableOpacity
                style={[
                  styles.roleCard,
                  role === 'cliente'
                    ? styles.roleCardActive
                    : styles.roleCardInactive,
                ]}
                onPress={() => setRole('cliente')}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.roleIconBox,
                    role === 'cliente'
                      ? styles.roleIconBoxActive
                      : styles.roleIconBoxInactive,
                  ]}
                >
                  <Ionicons
                    name="car-sport"
                    size={18}
                    color={role === 'cliente' ? '#000000' : '#8E8E93'}
                  />
                </View>
                <Text style={styles.roleTitle}>Usuario{'\n'}Cliente</Text>
                <Text style={styles.roleDescription}>
                  Quiero buscar y reservar espacios de parqueo
                </Text>
              </TouchableOpacity>
            </View>

            {/* Botón Registrarse */}
            <TouchableOpacity
              style={[styles.registerButton, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={styles.registerButtonText}>REGISTRARSE</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 6,
    marginBottom: 24,
  },
  formContainer: {
    width: '100%',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A0A0A0',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  requiredStar: {
    color: '#FFD200',
    fontWeight: 'bold',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F0F10',
    borderWidth: 1.5,
    borderColor: '#FFD200',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
  },
  textInput: {
    fontSize: 15,
    color: '#FFFFFF',
    flex: 1,
  },
  eyeButton: {
    padding: 6,
  },
  rolesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 28,
  },
  roleCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    minHeight: 145,
    justifyContent: 'space-between',
  },
  roleCardActive: {
    backgroundColor: '#101010',
    borderWidth: 1.5,
    borderColor: '#FFD200',
  },
  roleCardInactive: {
    backgroundColor: '#161618',
    borderWidth: 1,
    borderColor: '#262628',
  },
  roleIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  roleIconBoxActive: {
    backgroundColor: '#FFD200',
  },
  roleIconBoxInactive: {
    backgroundColor: '#242426',
  },
  roleIconTextP: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  roleTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    lineHeight: 18,
    marginBottom: 4,
  },
  roleDescription: {
    fontSize: 11,
    color: '#8E8E93',
    lineHeight: 15,
  },
  registerButton: {
    backgroundColor: '#FFD200',
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FFD200',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  registerButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
});

export default RegisterScreen;
