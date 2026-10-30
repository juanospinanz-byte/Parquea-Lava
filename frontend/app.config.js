// Extiende app.json con los permisos de ubicación, fotos y notificaciones.
// La app no usa APIs de Google: el mapa usa OpenStreetMap y las rutas se abren en la app de mapas del celular.
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'ParkApp usa tu ubicación para mostrarte los parqueaderos de tu ciudad.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'ParkApp usa tus fotos para que subas la foto de la entrada de tu parqueadero.',
        cameraPermission: 'ParkApp usa la cámara para que tomes la foto de la entrada de tu parqueadero.',
      },
    ],
    'expo-notifications',
  ],
});
