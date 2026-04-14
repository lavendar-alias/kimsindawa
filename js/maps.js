// ============================================================
// MAPS — Leaflet + OpenStreetMap (no API key required)
// ============================================================

const mapInstances = {};

// Custom marker icon
function createMarker(color = '#2E6B8A') {
  return L.divIcon({
    className: '',
    html: `<div class="map-pin" style="--pin-color:${color};">
             <div class="map-pin-head"></div>
             <div class="map-pin-tail"></div>
           </div>`,
    iconSize:   [24, 36],
    iconAnchor: [12, 36],
    popupAnchor:[0, -36],
  });
}

function createNumberedMarker(n, color = '#2E6B8A') {
  return L.divIcon({
    className: '',
    html: `<div class="map-pin numbered" style="--pin-color:${color};">
             <span>${n}</span>
           </div>`,
    iconSize:   [28, 28],
    iconAnchor: [14, 28],
    popupAnchor:[0, -30],
  });
}

// ─── Mini map for individual event ─────────────────────────
function initMiniMap(eventId, lat, lng, title) {
  const containerId = 'map-' + eventId;
  const container   = document.getElementById(containerId);
  if (!container || mapInstances[eventId]) return;

  const map = L.map(containerId, {
    center:          [lat, lng],
    zoom:            15,
    zoomControl:     true,
    scrollWheelZoom: false,
    dragging:        !L.Browser.mobile,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom:     19,
  }).addTo(map);

  // Find day accent color
  const day   = ITINERARY.find(d => d.events.some(e => e.id === eventId));
  const color = day?.accentColor || '#2E6B8A';

  const marker = L.marker([lat, lng], { icon: createMarker(color) }).addTo(map);
  marker.bindPopup(`<strong>${title}</strong>`, { closeButton: false });

  mapInstances[eventId] = map;
}

// ─── Day overview map ──────────────────────────────────────
function initDayOverviewMap(day) {
  const containerId = 'map-overview-' + day.id;
  const container   = document.getElementById(containerId);
  if (!container) return;

  const eventsWithCoords = day.events.filter(e => e.coords);
  if (eventsWithCoords.length === 0) {
    container.style.display = 'none';
    return;
  }

  // Center on the midpoint of all coords
  const avgLat = eventsWithCoords.reduce((s, e) => s + e.coords.lat, 0) / eventsWithCoords.length;
  const avgLng = eventsWithCoords.reduce((s, e) => s + e.coords.lng, 0) / eventsWithCoords.length;

  const map = L.map(containerId, {
    center:          [avgLat, avgLng],
    zoom:            12,
    zoomControl:     false,
    scrollWheelZoom: false,
    dragging:        false,
    attributionControl: false,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  // Add numbered markers and a polyline connecting them
  const latlngs = [];
  eventsWithCoords.forEach((event, i) => {
    const marker = L.marker([event.coords.lat, event.coords.lng], {
      icon: createNumberedMarker(i + 1, day.accentColor),
    }).addTo(map);
    marker.bindPopup(`<strong>${event.title}</strong><br>${event.address || ''}`, { closeButton: false });
    latlngs.push([event.coords.lat, event.coords.lng]);
  });

  if (latlngs.length > 1) {
    L.polyline(latlngs, {
      color:     day.accentColor,
      weight:    2,
      opacity:   0.6,
      dashArray: '6 4',
    }).addTo(map);
  }

  // Fit all markers in view
  if (latlngs.length > 0) {
    map.fitBounds(L.latLngBounds(latlngs), { padding: [20, 20] });
  }

  mapInstances['overview-' + day.id] = map;
}
