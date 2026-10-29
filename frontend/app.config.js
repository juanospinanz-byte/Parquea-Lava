// Extiende app.json con los permisos de ubicación.
// La app no usa APIs de Google: los mapas se abren en la app de mapas del celular.
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
  ],
});
