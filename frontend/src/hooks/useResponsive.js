import { useWindowDimensions } from 'react-native';

// Un dispositivo se considera tablet si su lado más corto mide 600dp o más
export const TABLET_MIN_SIDE = 600;

const useResponsive = () => {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= TABLET_MIN_SIDE;
  const isLandscape = width > height;

  return {
    width,
    height,
    isTablet,
    isLandscape,
    // Diseño a dos columnas: tablet en horizontal
    isWideLayout: isTablet && isLandscape,
  };
};

export default useResponsive;
