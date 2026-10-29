// Extiende app.json con la configuración de Google Maps.
// La API key se lee de la variable de entorno GOOGLE_MAPS_API_KEY (no se sube a git).
// Solo aplica en builds propias (npx expo run:ios / EAS Build); Expo Go la ignora.
module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

  return {
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
      ...(googleMapsApiKey
        ? [
            [
              'react-native-maps',
              {
                iosGoogleMapsApiKey: googleMapsApiKey,
                androidGoogleMapsApiKey: googleMapsApiKey,
              },
            ],
          ]
        : []),
    ],
  };
};
