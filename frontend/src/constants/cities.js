// Ciudades disponibles, con el centro de cada una, su departamento y otros nombres con que se escriben
export const CITIES = [
  { nombre: 'Armenia', departamento: 'Quindío', latitude: 4.5339, longitude: -75.6811 },
  { nombre: 'Barranquilla', departamento: 'Atlántico', latitude: 10.9685, longitude: -74.7813 },
  { nombre: 'Bogotá', departamento: 'Cundinamarca', latitude: 4.6097, longitude: -74.0817, alias: ['bogota dc', 'bogota d c', 'santafe de bogota', 'santa fe de bogota', 'bta'] },
  { nombre: 'Bucaramanga', departamento: 'Santander', latitude: 7.1193, longitude: -73.1227 },
  { nombre: 'Cali', departamento: 'Valle del Cauca', latitude: 3.4516, longitude: -76.532, alias: ['santiago de cali'] },
  { nombre: 'Cartagena', departamento: 'Bolívar', latitude: 10.391, longitude: -75.4794, alias: ['cartagena de indias'] },
  { nombre: 'Cúcuta', departamento: 'Norte de Santander', latitude: 7.8939, longitude: -72.5078, alias: ['san jose de cucuta'] },
  { nombre: 'Ibagué', departamento: 'Tolima', latitude: 4.4389, longitude: -75.2322 },
  { nombre: 'Manizales', departamento: 'Caldas', latitude: 5.0703, longitude: -75.5138 },
  { nombre: 'Medellín', departamento: 'Antioquia', latitude: 6.2442, longitude: -75.5812 },
  { nombre: 'Montería', departamento: 'Córdoba', latitude: 8.7479, longitude: -75.8814 },
  { nombre: 'Neiva', departamento: 'Huila', latitude: 2.9273, longitude: -75.2819 },
  { nombre: 'Pasto', departamento: 'Nariño', latitude: 1.2136, longitude: -77.2811, alias: ['san juan de pasto'] },
  { nombre: 'Pereira', departamento: 'Risaralda', latitude: 4.8133, longitude: -75.6961 },
  { nombre: 'Popayán', departamento: 'Cauca', latitude: 2.4448, longitude: -76.6147 },
  { nombre: 'Santa Marta', departamento: 'Magdalena', latitude: 11.2408, longitude: -74.199 },
  { nombre: 'Sincelejo', departamento: 'Sucre', latitude: 9.3047, longitude: -75.3978 },
  { nombre: 'Tunja', departamento: 'Boyacá', latitude: 5.5353, longitude: -73.3678 },
  { nombre: 'Valledupar', departamento: 'Cesar', latitude: 10.4631, longitude: -73.2532 },
  { nombre: 'Villavicencio', departamento: 'Meta', latitude: 4.142, longitude: -73.6266 },
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
