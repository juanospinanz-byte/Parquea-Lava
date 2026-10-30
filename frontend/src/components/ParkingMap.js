import React, { useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

// Mapa dentro de la app con Leaflet + mapas de OpenStreetMap (estilo oscuro de CARTO).
// No usa APIs de Google ni necesita llaves: funciona en Expo Go.
//
// markers: [{ id, latitude, longitude, title, subtitle, label, available }]
//   label: texto corto del pin (ej: celdas libres); available: false lo pinta en rojo
// userLocation: { latitude, longitude } opcional (punto azul)
// interactive: false para un mapa fijo (vista previa en el detalle)
// onSelect(id): al tocar "Ver detalles" en un pin
const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { height: 100%; margin: 0; background: #0F0F11; }
  .pin { display: flex; align-items: center; justify-content: center; min-width: 30px; height: 30px;
         padding: 0 6px; box-sizing: border-box; border-radius: 15px; border: 2px solid #000;
         background: #FFD200; color: #000; font: bold 13px -apple-system, Roboto, sans-serif;
         box-shadow: 0 2px 6px rgba(0,0,0,.5); }
  .pin.full { background: #FF5252; color: #fff; }
  .me { width: 16px; height: 16px; border-radius: 8px; background: #0A84FF; border: 3px solid #fff;
        box-shadow: 0 0 0 6px rgba(10,132,255,.25); box-sizing: border-box; }
  .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: #1C1C1E; color: #fff; }
  .popup-title { font: bold 14px -apple-system, Roboto, sans-serif; margin-bottom: 2px; }
  .popup-sub { font: 12px -apple-system, Roboto, sans-serif; color: #A0A0A0; margin-bottom: 8px; }
  .popup-btn { display: block; width: 100%; padding: 8px; border: 0; border-radius: 8px;
               background: #FFD200; color: #000; font: bold 12px -apple-system, Roboto, sans-serif; }
  .leaflet-control-attribution { background: rgba(0,0,0,.6) !important; color: #888 !important; font-size: 9px; }
  .leaflet-control-attribution a { color: #aaa !important; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: false }).setView([4.65, -74.08], 12);
  // Esri Dark Gray Canvas: no requiere API key (CARTO ahora sí la exige)
  var esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
  L.tileLayer(esri + 'World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, maxNativeZoom: 16,
    attribution: '&copy; Esri, HERE, Garmin, &copy; OpenStreetMap'
  }).addTo(map);
  L.tileLayer(esri + 'World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19, maxNativeZoom: 16
  }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var meMarker = null;
  var fitted = false;

  function send(msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  window.setData = function (data) {
    if (!data.interactive) {
      map.dragging.disable(); map.touchZoom.disable(); map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable(); map.boxZoom.disable(); map.keyboard.disable();
    }
    layer.clearLayers();
    var bounds = [];
    (data.markers || []).forEach(function (m) {
      var icon = L.divIcon({
        className: '',
        html: '<div class="pin' + (m.available === false ? ' full' : '') + '">' + esc(m.label || 'P') + '</div>',
        iconSize: [30, 30], iconAnchor: [15, 15]
      });
      var marker = L.marker([m.latitude, m.longitude], { icon: icon }).addTo(layer);
      if (data.interactive && data.selectable) {
        marker.bindPopup(
          '<div class="popup-title">' + esc(m.title) + '</div>' +
          '<div class="popup-sub">' + esc(m.subtitle) + '</div>' +
          '<button class="popup-btn" onclick="send({type:\\'select\\', id:' + Number(m.id) + '})">VER DETALLES</button>'
        );
      }
      bounds.push([m.latitude, m.longitude]);
    });

    if (meMarker) { map.removeLayer(meMarker); meMarker = null; }
    if (data.userLocation) {
      meMarker = L.marker([data.userLocation.latitude, data.userLocation.longitude], {
        icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
        interactive: false
      }).addTo(map);
    }

    // Se encuadra solo la primera vez, para no mover el mapa mientras el usuario lo explora
    if (!fitted) {
      if (bounds.length === 1) map.setView(bounds[0], data.zoom || 16);
      else if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      else if (data.center) map.setView([data.center.latitude, data.center.longitude], 12);
      fitted = bounds.length > 0 || !!data.center;
    }
  };

  send({ type: 'ready' });
</script>
</body>
</html>`;

const ParkingMap = ({
  markers = [],
  userLocation = null,
  center = null,
  interactive = true,
  zoom,
  onSelect,
  style,
}) => {
  const webViewRef = useRef(null);
  const readyRef = useRef(false);

  const pushData = useCallback(() => {
    if (!readyRef.current || !webViewRef.current) return;
    const data = { markers, userLocation, center, interactive, zoom, selectable: !!onSelect };
    webViewRef.current.injectJavaScript(`window.setData(${JSON.stringify(data)}); true;`);
  }, [markers, userLocation, center, interactive, zoom, onSelect]);

  // Cada vez que cambian los pines (por ejemplo, la disponibilidad) se redibujan
  useEffect(() => {
    pushData();
  }, [pushData]);

  const handleMessage = (event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'ready') {
        readyRef.current = true;
        pushData();
      } else if (message.type === 'select' && onSelect) {
        onSelect(message.id);
      }
    } catch (error) {
      // Mensaje que no es de este mapa
    }
  };

  return (
    <View style={[styles.container, style]} pointerEvents={interactive ? 'auto' : 'none'}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: MAP_HTML, baseUrl: 'https://parkapp.local/' }}
        onMessage={handleMessage}
        javaScriptEnabled
        scrollEnabled={false}
        style={styles.webview}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#0F0F11',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0F0F11',
  },
});

export default ParkingMap;
