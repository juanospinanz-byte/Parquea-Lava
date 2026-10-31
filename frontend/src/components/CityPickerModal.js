import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CITIES, normalizeText } from '../constants/cities';
import { colors } from '../theme';

const CityPickerModal = ({ visible, selected, onSelect, onClose }) => {
  const [query, setQuery] = useState('');

  const cities = CITIES.filter((city) =>
    normalizeText(city.nombre).includes(normalizeText(query))
  );

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  const handleSelect = (city) => {
    setQuery('');
    onSelect(city);
  };

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>¿En qué ciudad vives?</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar ciudad..."
              placeholderTextColor={colors.placeholder}
              value={query}
              onChangeText={setQuery}
            />
          </View>

          <FlatList
            data={cities}
            keyExtractor={(item) => item.nombre}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            ListEmptyComponent={<Text style={styles.emptyText}>No encontramos esa ciudad</Text>}
            renderItem={({ item }) => {
              const isSelected = selected === item.nombre;
              return (
                <TouchableOpacity
                  style={[styles.option, isSelected && styles.optionSelected]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color={isSelected ? colors.onPrimary : colors.primary}
                  />
                  <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                    {item.nombre}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color={colors.onPrimary} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBox: {
    height: 46,
    backgroundColor: colors.surfaceSunken,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  list: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  optionTextSelected: {
    color: colors.onPrimary,
    fontWeight: 'bold',
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
});

export default CityPickerModal;
