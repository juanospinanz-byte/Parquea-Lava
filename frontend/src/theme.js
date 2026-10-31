// Paleta y medidas compartidas de la app: negro + amarillo ParkApp.
// Usar estos valores en vez de escribir colores sueltos en cada pantalla.

export const colors = {
  // Marca
  primary: '#FFD200',
  primarySoft: '#1F1F10', // fondo de chips y botones secundarios amarillos
  primaryBorder: '#3D3D20',
  onPrimary: '#000000', // texto e íconos sobre amarillo

  // Fondos (de más oscuro a más claro)
  bg: '#000000',
  surfaceSunken: '#0F0F11', // inputs, pastillas dentro de tarjetas
  surface: '#161618', // tarjetas
  surfaceRaised: '#1C1C1E', // modales, cajas de íconos
  surfaceHigh: '#262628', // botones dentro de modales

  // Bordes
  border: '#262628',
  borderStrong: '#3A3A3C',

  // Texto
  text: '#FFFFFF',
  textSecondary: '#A1A1A6', // etiquetas y títulos de sección
  textMuted: '#8E8E93', // subtítulos y descripciones
  textFaint: '#5A5A5E', // pistas y estados vacíos
  placeholder: '#6B6B70',

  // Estados
  danger: '#FF5252',
  dangerText: '#FF8A8A',
  dangerSoft: '#1A0F0F',
  dangerBorder: '#4A1F1F',
  success: '#34C759',
  successBorder: '#1F3D25',
  warning: '#FF9F0A',

  white: '#FFFFFF',
  black: '#000000',
};

export const radius = {
  sm: 8, // chips, insignias
  md: 12, // botones, inputs
  lg: 16, // tarjetas
  xl: 20, // modales
};
