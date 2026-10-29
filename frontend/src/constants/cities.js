// Ciudades disponibles para el cliente, con el centro de cada una para ubicar el mapa
export const CITIES = [
  { nombre: 'Armenia', latitude: 4.5339, longitude: -75.6811 },
  { nombre: 'Barranquilla', latitude: 10.9685, longitude: -74.7813 },
  { nombre: 'Bogotá', latitude: 4.6097, longitude: -74.0817 },
  { nombre: 'Bucaramanga', latitude: 7.1193, longitude: -73.1227 },
  { nombre: 'Cali', latitude: 3.4516, longitude: -76.532 },
  { nombre: 'Cartagena', latitude: 10.391, longitude: -75.4794 },
  { nombre: 'Cúcuta', latitude: 7.8939, longitude: -72.5078 },
  { nombre: 'Ibagué', latitude: 4.4389, longitude: -75.2322 },
  { nombre: 'Manizales', latitude: 5.0703, longitude: -75.5138 },
  { nombre: 'Medellín', latitude: 6.2442, longitude: -75.5812 },
  { nombre: 'Montería', latitude: 8.7479, longitude: -75.8814 },
  { nombre: 'Neiva', latitude: 2.9273, longitude: -75.2819 },
  { nombre: 'Pasto', latitude: 1.2136, longitude: -77.2811 },
  { nombre: 'Pereira', latitude: 4.8133, longitude: -75.6961 },
  { nombre: 'Popayán', latitude: 2.4448, longitude: -76.6147 },
  { nombre: 'Santa Marta', latitude: 11.2408, longitude: -74.199 },
  { nombre: 'Sincelejo', latitude: 9.3047, longitude: -75.3978 },
  { nombre: 'Tunja', latitude: 5.5353, longitude: -73.3678 },
  { nombre: 'Valledupar', latitude: 10.4631, longitude: -73.2532 },
  { nombre: 'Villavicencio', latitude: 4.142, longitude: -73.6266 },
];

// Compara sin tildes ni mayúsculas ("medellin" === "Medellín")
export const normalizeText = (text) =>
  (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export const findCity = (nombre) =>
  CITIES.find((city) => normalizeText(city.nombre) === normalizeText(nombre)) || null;
