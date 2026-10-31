import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';

// Cabecera de las pantallas principales: marca a la izquierda y acceso al perfil a la derecha
const AppHeader = ({ onProfilePress, style }) => (
  <View style={[styles.header, style]}>
    <View style={styles.brand}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>P</Text>
      </View>
      <Text style={styles.brandText}>PARKAPP</Text>
    </View>
    <TouchableOpacity
      style={styles.profileButton}
      onPress={onProfilePress}
      activeOpacity={0.7}
      accessibilityLabel="Mi perfil"
    >
      <Ionicons name="person-outline" size={20} color={colors.text} />
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: colors.onPrimary,
    fontSize: 17,
    fontWeight: '900',
  },
  brandText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AppHeader;
