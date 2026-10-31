import React, { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';

// Campo de texto con borde neutro que se ilumina en amarillo mientras se escribe.
// style: caja del campo · inputStyle: el texto · children: botón a la derecha (ej: ver contraseña)
const Field = ({ style, inputStyle, children, onFocus, onBlur, ...inputProps }) => {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.box, style, focused && styles.boxFocused]}>
      <TextInput
        style={[styles.input, inputStyle]}
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.primary}
        cursorColor={colors.primary}
        {...inputProps}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  boxFocused: {
    borderColor: colors.primary,
  },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    color: colors.text,
    fontSize: 15,
    paddingVertical: 12,
  },
});

export default Field;
