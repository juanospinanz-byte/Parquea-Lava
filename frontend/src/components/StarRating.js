import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Estrellas de 1 a 5. Con onChange se pueden tocar para calificar; sin onChange solo se muestran
// (acepta medias estrellas, ej: 4.5)
const StarRating = ({ value = 0, size = 16, onChange, color = '#FFD200', gap = 2 }) => (
  <View style={[styles.row, { gap }]}>
    {[1, 2, 3, 4, 5].map((n) => {
      const name = value >= n ? 'star' : value >= n - 0.5 ? 'star-half' : 'star-outline';
      const icon = <Ionicons name={name} size={size} color={color} />;
      return onChange ? (
        <TouchableOpacity
          key={n}
          onPress={() => onChange(n)}
          hitSlop={6}
          accessibilityLabel={`${n} estrella${n > 1 ? 's' : ''}`}
        >
          {icon}
        </TouchableOpacity>
      ) : (
        <View key={n}>{icon}</View>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default StarRating;
