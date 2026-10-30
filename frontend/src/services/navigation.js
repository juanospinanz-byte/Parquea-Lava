import { createNavigationContainerRef } from '@react-navigation/native';

// Permite navegar desde fuera de las pantallas (por ejemplo, desde services/api.js)
export const navigationRef = createNavigationContainerRef();

// Vuelve al login y borra el historial para que no se pueda regresar con "atrás"
export const resetToLogin = () => {
  if (navigationRef.isReady()) {
    navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
  }
};
