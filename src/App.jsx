import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { saveReading, getReadings, clearReadings, exportGeoJSON } from './db';
import { getNetworkMetrics, normalizeSignal, getRsrpColor, requestTelephonyPermissions, checkTelephonyPermissions } from './telephony';
import './App.css';

// Fix Leaflet default marker icons in bundled builds.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function createSignalIcon(rsrp) {
  const color = getRsrpColor(rsrp);
  return L.divIcon({
    className: 'signal-marker',
    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -7],
  });
}

function MapAutoPan({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.panTo(position);
    }
  }, [position, map]);
  return null;
}

export default function App() {
  const [isTracking, setIsTracking] = useState(false);
  const [readings, setReadings] = useState([]);
  const [currentPosition, setCurrentPosition] = useState([51.505, -0.09]);
  const [status, setStatus] = useState('Ready');
  const [latest, setLatest] = useState(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const watchId = useRef(null);
  const intervalRef = useRef(null);
  const shouldStartAfterPermission = useRef(false);

  useEffect(() => {
    loadHistory();
    checkPermissions();
    return () => stopTracking();
  }, []);

  async function checkPermissions() {
    try {
      const telephonyPerm = await checkTelephonyPermissions();
      const granted = telephonyPerm.granted === true;
      setPermissionGranted(granted);
      if (!granted) {
        const details = `location=${telephonyPerm.location} phone=${telephonyPerm.phone}`;
        setStatus(`Permissions required (${details}) — tap Start to grant`);
      }
    } catch (err) {
      console.warn('Permission check failed', err);
    }
  }

  async function requestPermissions() {
    try {
      const telephonyPerm = await requestTelephonyPermissions();
      const granted = telephonyPerm.granted === true;
      setPermissionGranted(granted);
      if (!granted) {
        const details = `location=${telephonyPerm.location} phone=${telephonyPerm.phone}`;
        setStatus(`Permissions required (${details})`);
      } else {
        setStatus('Permissions granted');
        if (shouldStartAfterPermission.current) {
          shouldStartAfterPermission.current = false;
          startTracking();
        }
      }
    } catch (err) {
      console.warn('Permission request failed', err);
      setPermissionGranted(false);
      setStatus(`Permission request failed: ${err.message || err}`);
    }
  }

  async function loadHistory() {
    const data = await getReadings();
    setReadings(data);
    if (data.length > 0) {
      const last = data[data.length - 1];
      setCurrentPosition([last.lat, last.lng]);
    }
  }

  async function capturePoint(position) {
    const { latitude: lat, longitude: lng, accuracy } = position.coords;
    const metrics = await getNetworkMetrics();

    if (metrics?.error) {
      setCurrentPosition([lat, lng]);
      setStatus(`Cell error: ${metrics.error}`);
      return;
    }

    const signal = normalizeSignal(metrics);

    const reading = {
      lat,
      lng,
      accuracy: accuracy ?? null,
      timestamp: Date.now(),
      rsrp: signal?.rsrp ?? null,
      rsrq: signal?.rsrq ?? null,
      type: signal?.type ?? 'UNKNOWN',
      cellId: signal?.cellId ?? null,
      pci: signal?.pci ?? null,
      tac: signal?.tac ?? null,
      mcc: signal?.mcc ?? null,
      mnc: signal?.mnc ?? null,
      raw: metrics,
    };

    await saveReading(reading);
    setReadings((prev) => [...prev, reading]);
    setCurrentPosition([lat, lng]);
    setLatest(reading);
    setStatus(`Captured ${signal?.type || '—'} @ ${rsrpLabel(signal?.rsrp)}`);
  }

  function rsrpLabel(rsrp) {
    if (rsrp == null) return '— dBm';
    return `${rsrp} dBm`;
  }

  function startTracking() {
    if (!permissionGranted) {
      shouldStartAfterPermission.current = true;
      requestPermissions();
      return;
    }

    setIsTracking(true);
    setStatus('Tracking started…');

    // Capture immediately, then every second if geolocation hasn't changed.
    captureFromGeolocation();
    intervalRef.current = setInterval(() => {
      captureFromGeolocation();
    }, 1000);
  }

  function captureFromGeolocation() {
    if (!navigator.geolocation) {
      setStatus('Geolocation not supported on this device.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => capturePoint(pos),
      (err) => {
        const codeNames = {
          1: 'Permission denied',
          2: 'Position unavailable',
          3: 'Timeout',
        };
        setStatus(`GPS error ${err.code}: ${codeNames[err.code] || err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }

  function stopTracking() {
    setIsTracking(false);
    setStatus('Tracking paused');
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (watchId.current) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }

  async function handleClear() {
    if (!confirm('Clear all saved readings?')) return;
    await clearReadings();
    setReadings([]);
    setLatest(null);
    setStatus('History cleared');
  }

  async function handleExport() {
    const geojson = await exportGeoJSON();
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `signal-strength-${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('GeoJSON exported');
  }

  const positions = readings.map((r) => [r.lat, r.lng]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Cell Tower & Signal Mapper</h1>
        <div className="status-bar">
          <span className={`status-dot ${isTracking ? 'active' : ''}`}></span>
          <span>{status}</span>
        </div>
      </header>

      <div className="metrics-panel">
        <div className="metric">
          <strong>Type</strong>
          <span>{latest?.type || '—'}</span>
        </div>
        <div className="metric">
          <strong>RSRP</strong>
          <span style={{ color: getRsrpColor(latest?.rsrp) }}>{rsrpLabel(latest?.rsrp)}</span>
        </div>
        <div className="metric">
          <strong>RSRQ</strong>
          <span>{latest?.rsrq != null ? `${latest.rsrq} dB` : '— dB'}</span>
        </div>
        <div className="metric">
          <strong>Cell ID</strong>
          <span>{latest?.cellId ?? '—'}</span>
        </div>
        <div className="metric">
          <strong>PCI</strong>
          <span>{latest?.pci ?? '—'}</span>
        </div>
        <div className="metric">
          <strong>Points</strong>
          <span>{readings.length}</span>
        </div>
      </div>

      <div className="controls">
        <button onClick={isTracking ? stopTracking : startTracking} className={isTracking ? 'stop' : 'start'}>
          {isTracking ? 'Stop Tracking' : 'Start Tracking'}
        </button>
        <button onClick={handleClear} className="secondary">
          Clear History
        </button>
        <button onClick={handleExport} className="secondary">
          Export GeoJSON
        </button>
      </div>

      <div className="map-wrap">
        <MapContainer center={currentPosition} zoom={16} scrollWheelZoom={true} className="map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapAutoPan position={currentPosition} />
          {positions.length > 1 && <Polyline positions={positions} color="#3b82f6" weight={3} />}
          {readings.map((r, idx) => (
            <Marker key={idx} position={[r.lat, r.lng]} icon={createSignalIcon(r.rsrp)}>
              <Popup>
                <div className="popup">
                  <p><strong>Type:</strong> {r.type}</p>
                  <p><strong>RSRP:</strong> {r.rsrp ?? '—'} dBm</p>
                  <p><strong>RSRQ:</strong> {r.rsrq ?? '—'} dB</p>
                  <p><strong>Cell ID:</strong> {r.cellId ?? '—'}</p>
                  <p><strong>PCI:</strong> {r.pci ?? '—'}</p>
                  <p><strong>TAC:</strong> {r.tac ?? '—'}</p>
                  <p><strong>MCC/MNC:</strong> {r.mcc ?? '—'} / {r.mnc ?? '—'}</p>
                  <p><strong>Time:</strong> {new Date(r.timestamp).toLocaleString()}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <footer className="app-footer">
        <p>
          Grant Location & Phone permissions for full cell metrics. Data is stored locally on your device.
        </p>
      </footer>
    </div>
  );
}
