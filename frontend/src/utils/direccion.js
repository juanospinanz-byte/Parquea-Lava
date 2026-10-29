import { CITIES } from '../constants/cities';

// Normalización de direcciones con nomenclatura urbana colombiana, para que el
// geocodificador del celular las entienda.
// Ej: "ac.24 #95a-80, Bogotá" -> "Avenida Calle 24 # 95A - 80, Bogotá, Cundinamarca, Colombia"

// Radio (km) que se considera "la ciudad", cubre el área metropolitana (igual que en el cliente)
export const CITY_RADIUS_KM = 30;

// Tipos de vía y sus abreviaturas. El orden importa: "Avenida Calle" antes que "Avenida" y "Calle".
// La abreviatura debe ir seguida de espacio, número o "#" para no confundir "k" con "Kennedy".
const FIN_ABREVIATURA = '\\.?(?=[\\s\\d#]|$)';
const TIPOS_VIA = [
  ['Avenida Calle', `(?:(?:avenida|av)\\.?\\s*(?:calle|cll|cl)|ac)${FIN_ABREVIATURA}`],
  ['Avenida Carrera', `(?:(?:avenida|av)\\.?\\s*(?:carrera|cra|kra|kr|cr)|ak)${FIN_ABREVIATURA}`],
  ['Calle', `(?:calle|cll|cl)${FIN_ABREVIATURA}`],
  ['Carrera', `(?:carrera|carr|cra|kra|kr|cr|k)${FIN_ABREVIATURA}`],
  ['Diagonal', `(?:diagonal|diag|dg)${FIN_ABREVIATURA}`],
  ['Transversal', `(?:transversal|transv|trans|tv|tr)${FIN_ABREVIATURA}`],
  ['Circular', `(?:circular|circ|cq)${FIN_ABREVIATURA}`],
  ['Autopista', `(?:autopista|aut)${FIN_ABREVIATURA}`],
  ['Avenida', `(?:avenida|av)${FIN_ABREVIATURA}`],
].map(([nombre, patron]) => ({ nombre, regex: new RegExp(`^${patron}\\s*`, 'i') }));

// Compara sin tildes, mayúsculas ni puntuación ("Bogotá D.C." === "bogota dc")
const simplificar = (texto) =>
  (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buscarCiudad = (texto) => {
  const buscado = simplificar(texto);
  if (!buscado) return null;
  return (
    CITIES.find((c) => simplificar(c.nombre) === buscado || (c.alias || []).includes(buscado)) ||
    null
  );
};

export const distanciaKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Ciudad más cercana a unas coordenadas, si están dentro de su área metropolitana
export const ciudadCercana = (coords) => {
  if (!coords) return null;
  let mejor = null;
  let mejorDistancia = Infinity;
  for (const ciudad of CITIES) {
    const d = distanciaKm(coords.latitude, coords.longitude, ciudad.latitude, ciudad.longitude);
    if (d < mejorDistancia) {
      mejor = ciudad;
      mejorDistancia = d;
    }
  }
  return mejorDistancia <= CITY_RADIUS_KM ? mejor : null;
};

// "ac.24 #95a-80" -> "Avenida Calle 24 # 95A - 80"
export const normalizarVia = (texto) => {
  let via = texto.replace(/\s+/g, ' ').trim();

  const tipo = TIPOS_VIA.find((t) => t.regex.test(via));
  if (tipo) via = `${tipo.nombre} ${via.replace(tipo.regex, '')}`;

  via = via
    // "No. 95", "N° 95", "Nro 95", "Número 95" -> "# 95"
    .replace(/(?:\b(?:n[uú]mero|numero|nro|num|no)\.?|\bn\s*[°º]|#)\s*(?=\d)/gi, ' # ')
    // "95bis" -> "95 Bis"
    .replace(/(\d)\s*bis\b/gi, '$1 Bis')
    .replace(/\bbis\b/gi, 'Bis')
    // Letra pegada al número: "95a" / "95 a" -> "95A"
    .replace(/(\d+)\s?([a-z])(?![a-zñ])/gi, (_, n, letra) => `${n}${letra.toUpperCase()}`)
    // Letra después de Bis: "Bis a" -> "Bis A"
    .replace(/\bBis ([a-z])(?![a-zñ])/gi, (_, letra) => `Bis ${letra.toUpperCase()}`)
    .replace(/\b(sur|este|norte|oeste)\b/gi, (c) => c[0].toUpperCase() + c.slice(1).toLowerCase())
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();

  // "# 95A 80" (sin guion) -> "# 95A - 80"
  via = via.replace(/# (\d+[A-Z]?(?: Bis(?: [A-Z])?)?) (\d+)\b/, '# $1 - $2');

  return via;
};

// Separa la vía de la ciudad y arma la dirección limpia y la consulta para el geocodificador.
// ciudadPorDefecto se usa cuando el texto no trae ciudad (ej: la ciudad donde está el dueño).
export const normalizarDireccion = (direccion, ciudadPorDefecto = null) => {
  const partes = (direccion || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!partes.length) return null;

  const via = normalizarVia(partes[0]);
  let ciudad = null;
  const extras = [];

  for (const parte of partes.slice(1)) {
    const encontrada = buscarCiudad(parte);
    if (encontrada) {
      ciudad = ciudad || encontrada;
    } else if (
      simplificar(parte) !== 'colombia' &&
      !CITIES.some((c) => simplificar(c.departamento) === simplificar(parte))
    ) {
      extras.push(parte);
    }
  }
  ciudad = ciudad || ciudadPorDefecto;

  const direccionLimpia = [via, ...extras, ciudad?.nombre].filter(Boolean).join(', ');
  // A la consulta no van barrio ni referencias: confunden al geocodificador
  const consulta = [via, ciudad?.nombre, ciudad?.departamento, 'Colombia'].filter(Boolean).join(', ');

  return { direccion: direccionLimpia, consulta, via, ciudad };
};
