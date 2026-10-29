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
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#8E8E93" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar ciudad..."
              placeholderTextColor="#666668"
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
                    color={isSelected ? '#000000' : '#FFD200'}
                  />
                  <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                    {item.nombre}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color="#000000" />}
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
    backgroundColor: '#161618',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2C2C2E',
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
    color: '#FFFFFF',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#262628',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBox: {
    height: 46,
    backgroundColor: '#0F0F11',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262628',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
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
    backgroundColor: '#0F0F11',
    borderWidth: 1,
    borderColor: '#262628',
  },
  optionSelected: {
    backgroundColor: '#FFD200',
    borderColor: '#FFD200',
  },
  optionText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
  },
  optionTextSelected: {
    color: '#000000',
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#8E8E93',
    textAlign: 'center',
    paddingVertical: 20,
  },
});

export default CityPickerModal;
