import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { onRealtime } from '../services/realtime';

// Escucha un evento de tiempo real mientras la pantalla está visible
const useRealtime = (event, handler) => {
  // Siempre se llama a la versión más reciente del handler (sin reconectar en cada render)
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useFocusEffect(
    useCallback(() => onRealtime(event, (payload) => handlerRef.current(payload)), [event])
  );
};

export default useRealtime;
