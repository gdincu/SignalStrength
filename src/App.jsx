import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { saveReading, getReadings, clearReadings, exportGeoJSON } from './db';
import { getNetworkMetrics, normalizeSignal, getRsrpColor, getRsrqColor, getSignalColor, requestTelephonyPermissions, checkTelephonyPermissions } from './telephony';
import './App.css';

const MAX_MARKERS = 200;

// Cache divIcons by color bucket (only ~5 exist) instead of creating a new
// L.divIcon for every marker on every render.
const signalIconCache = new Map();
function getCachedSignalIcon(signal) {
  const color = getSignalColor(signal);
  let icon = signalIconCache.get(color);
  if (!icon) {
    icon = L.divIcon({
      className: 'signal-marker',
      html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -7],
    });
    signalIconCache.set(color, icon);
  }
  return icon;
}

function MapFollowController({ position, enabled, onUserDrag }) {
  const map = useMap();
  useEffect(() => {
    if (enabled && position) {
      map.panTo(position);
    }
  }, [position, enabled, map]);
  useEffect(() => {
    if (!onUserDrag) return undefined;
    const handleDragStart = () => onUserDrag();
    map.on('dragstart', handleDragStart);
    return () => {
      map.off('dragstart', handleDragStart);
    };
  }, [map, onUserDrag]);
  return null;
}

function rsrpLabel(rsrp) {
  if (rsrp == null) return '— dBm';
  return `${rsrp} dBm`;
}

function signalStrengthLabel(signal) {
  if (!signal) return '— dBm';
  if (signal.rsrp != null) return `${signal.rsrp} dBm`;
  if (signal.dbm != null) return `${signal.dbm} dBm`;
  return '— dBm';
}

export default function App() {
  const [isTracking, setIsTracking] = useState(false);
  const [readings, setReadings] = useState([]);
  const [currentPosition, setCurrentPosition] = useState([51.505, -0.09]);
  const [statusHistory, setStatusHistory] = useState([
    { id: 0, time: new Date().toLocaleTimeString(), text: 'Ready' },
  ]);
  const [logExpanded, setLogExpanded] = useState(false);
  const [latest, setLatest] = useState(null);
  const [followMode, setFollowMode] = useState(true);

  const intervalRef = useRef(null);
  const shouldStartAfterPermission = useRef(false);
  const permissionGrantedRef = useRef(false);
  const permissionRequestInFlight = useRef(false);
  const isCapturingRef = useRef(false);
  const statusIdRef = useRef(1);

  const pushStatus = useCallback((message) => {
    const id = statusIdRef.current++;
    setStatusHistory((prev) =>
      [{ id, time: new Date().toLocaleTimeString(), text: message }, ...prev].slice(0, 10)
    );
  }, []);

  const clearStatusHistory = useCallback(() => {
    setStatusHistory([]);
  }, []);

  const stopTracking = useCallback(() => {
    const wasActive = intervalRef.current != null;
    setIsTracking(false);
    isCapturingRef.current = false;
    if (wasActive) {
      pushStatus('Tracking paused');
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [pushStatus]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await getReadings();
      setReadings(data);
      if (data.length > 0) {
        const last = data[data.length - 1];
        setCurrentPosition([last.lat, last.lng]);
        setLatest(data[data.length - 1]);
      }
    } catch (err) {
      pushStatus(`Failed to load history: ${err?.message || err}`);
    }
  }, [pushStatus]);

  const checkPermissions = useCallback(async () => {
    try {
      const telephonyPerm = await checkTelephonyPermissions();
      const granted = telephonyPerm.granted === true;
      permissionGrantedRef.current = granted;
      if (!granted) {
        const details = `location=${telephonyPerm.location} phone=${telephonyPerm.phone}`;
        const suffix = telephonyPerm.error ? ` (${telephonyPerm.error})` : '';
        pushStatus(`Permissions required (${details})${suffix} — tap Start to grant`);
      }
    } catch (err) {
      console.warn('Permission check failed', err);
    }
  }, [pushStatus]);

  // Defined before effects so the React Compiler / oxlint doesn't flag
  // reads-during-initialization.
  useEffect(() => {
    loadHistory();
    checkPermissions();
    const handleVisibility = () => {
      // Permission may have been granted in system Settings while away.
      if (document.visibilityState === 'visible') {
        checkPermissions();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      stopTracking();
    };
  }, [loadHistory, checkPermissions, stopTracking]);

  const capturePoint = useCallback(async (position) => {
    const { latitude: lat, longitude: lng, accuracy } = position.coords;
    let metrics;
    try {
      metrics = await getNetworkMetrics();
    } catch (err) {
      metrics = { error: err?.message || String(err) };
    }

    const signal = metrics?.error ? null : normalizeSignal(metrics);
    const timestamp = Date.now();

    // Keep the GPS fix even when the cell read fails — otherwise the route
    // gets gaps exactly where signal is worst (the data we most want).
    // `raw`/allCells intentionally omitted to keep IndexedDB small at 1 pt/sec.
    const reading = {
      ...(signal ?? {}),
      lat,
      lng,
      accuracy: accuracy ?? null,
      timestamp,
      rsrp: signal?.rsrp ?? null,
      rsrq: signal?.rsrq ?? null,
      type: signal?.type ?? 'UNKNOWN',
      cellId: signal?.cellId ?? null,
      pci: signal?.pci ?? null,
      tac: signal?.tac ?? null,
      mcc: signal?.mcc ?? null,
      mnc: signal?.mnc ?? null,
      ...(metrics?.error ? { error: metrics.error } : {}),
    };

    try {
      const id = await saveReading(reading);
      const saved = { ...reading, id };
      setReadings((prev) => [...prev, saved]);
      setCurrentPosition([lat, lng]);
      setLatest(saved);
      if (metrics?.error) {
        pushStatus(`Captured GPS, cell unavailable: ${metrics.error}`);
      } else {
        pushStatus(`Captured ${signal?.type || '—'} @ ${signalStrengthLabel(signal)}`);
      }
    } catch (err) {
      setCurrentPosition([lat, lng]);
      pushStatus(`Save failed: ${err?.message || err}`);
    }
  }, [pushStatus]);

  const captureFromGeolocation = useCallback(() => {
    if (isCapturingRef.current) return;
    if (!navigator.geolocation) {
      pushStatus('Geolocation not supported on this device.');
      return;
    }

    isCapturingRef.current = true;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await capturePoint(pos);
        } finally {
          isCapturingRef.current = false;
        }
      },
      (err) => {
        isCapturingRef.current = false;
        const codeNames = {
          1: 'Permission denied',
          2: 'Position unavailable',
          3: 'Timeout',
        };
        pushStatus(`GPS error ${err.code}: ${codeNames[err.code] || err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );
  }, [capturePoint, pushStatus]);

  const beginTracking = useCallback(() => {
    if (intervalRef.current) return;
    setIsTracking(true);
    pushStatus('Tracking started…');

    // Capture immediately, then every second (skipped while previous
    // capture is still pending — see isCapturingRef guard).
    captureFromGeolocation();
    intervalRef.current = setInterval(() => {
      captureFromGeolocation();
    }, 1000);
  }, [captureFromGeolocation, pushStatus]);

  const requestPermissions = useCallback(async () => {
    if (permissionRequestInFlight.current) return;
    permissionRequestInFlight.current = true;
    try {
      const telephonyPerm = await requestTelephonyPermissions();
      const granted = telephonyPerm.granted === true;
      permissionGrantedRef.current = granted;
      if (!granted) {
        shouldStartAfterPermission.current = false;
        const details = `location=${telephonyPerm.location} phone=${telephonyPerm.phone}`;
        const suffix = telephonyPerm.error ? ` (${telephonyPerm.error})` : '';
        pushStatus(`Permissions required (${details})${suffix}`);
      } else {
        pushStatus('Permissions granted');
        if (shouldStartAfterPermission.current) {
          shouldStartAfterPermission.current = false;
          beginTracking();
        }
      }
    } catch (err) {
      console.warn('Permission request failed', err);
      permissionGrantedRef.current = false;
      shouldStartAfterPermission.current = false;
      pushStatus(`Permission request failed: ${err.message || err}`);
    } finally {
      permissionRequestInFlight.current = false;
    }
  }, [beginTracking, pushStatus]);

  function startTracking() {
    if (intervalRef.current) return;
    if (!permissionGrantedRef.current) {
      shouldStartAfterPermission.current = true;
      requestPermissions();
      return;
    }

    beginTracking();
  }

  const handleDisableFollow = useCallback(() => {
    setFollowMode(false);
  }, []);

  async function handleClear() {
    if (!confirm('Clear all saved readings?')) return;
    try {
      await clearReadings();
      setReadings([]);
      setLatest(null);
      pushStatus('History cleared');
    } catch (err) {
      pushStatus(`Clear failed: ${err?.message || err}`);
    }
  }

  async function handleExport() {
    try {
      const geojson = await exportGeoJSON();
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signal-strength-${new Date().toISOString().slice(0, 10)}.geojson`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      pushStatus('GeoJSON exported');
    } catch (err) {
      pushStatus(`Export failed: ${err?.message || err}`);
    }
  }

  const positions = readings.map((r) => [r.lat, r.lng]);
  const visibleReadings = readings.length > MAX_MARKERS ? readings.slice(-MAX_MARKERS) : readings;

  return (
    <div className="app">
      <header className="app-header">
        <h1>SignalStrength</h1>
        <div className="status-bar">
          <span className={`status-dot ${isTracking ? 'active' : ''}`}></span>
          <span>{isTracking ? 'Tracking' : 'Tracking paused'}</span>
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
          <span style={{ color: getRsrqColor(latest?.rsrq) }}>{latest?.rsrq != null ? `${latest.rsrq} dB` : '— dB'}</span>
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
          <MapFollowController position={currentPosition} enabled={followMode} onUserDrag={handleDisableFollow} />
          {positions.length > 1 && <Polyline positions={positions} color="#3b82f6" weight={3} />}
          {visibleReadings.map((r) => (
            <Marker key={r.id ?? `${r.timestamp}-${r.lat}-${r.lng}`} position={[r.lat, r.lng]} icon={getCachedSignalIcon(r)}>
              <Popup>
                <div className="popup">
                  <p><strong>Type:</strong> {r.type}</p>
                  <p><strong>Signal:</strong> <span style={{ color: getSignalColor(r) }}>{signalStrengthLabel(r)}</span></p>
                  <p><strong>RSRP:</strong> <span style={{ color: getRsrpColor(r.rsrp) }}>{r.rsrp ?? '—'} dBm</span></p>
                  <p><strong>RSRQ:</strong> <span style={{ color: getRsrqColor(r.rsrq) }}>{r.rsrq ?? '—'} dB</span></p>
                  {r.dbm != null && <p><strong>dBm:</strong> {r.dbm}</p>}
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
        <button
          type="button"
          className={`follow-toggle ${followMode ? 'on' : ''}`}
          onClick={() => setFollowMode((v) => !v)}
          title={followMode ? 'Stop following GPS' : 'Follow GPS'}
        >
          {followMode ? 'Following' : 'Follow'}
        </button>
      </div>

      <div className="status-history">
        <button
          className="status-history-toggle"
          onClick={() => setLogExpanded((v) => !v)}
          aria-expanded={logExpanded}
        >
          <strong>Status log ({statusHistory.length})</strong>
          <span className="toggle-icon">{logExpanded ? '▾' : '▸'}</span>
        </button>
        {logExpanded && (
          <>
            <div className="status-history-actions">
              <button onClick={clearStatusHistory} className="secondary small">
                Clear log
              </button>
            </div>
            {statusHistory.length === 0 ? (
              <p className="status-history-empty">No messages yet.</p>
            ) : (
              <ul>
                {statusHistory.map((entry) => (
                  <li key={entry.id}>
                    <span className="status-time">{entry.time}</span>
                    <span>{entry.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <footer className="app-footer">
        <p>
          Grant Location & Phone permissions for full cell metrics. Data is stored locally on your device.
          {readings.length > MAX_MARKERS && (
            <> Showing last {MAX_MARKERS} markers; full route drawn as line.</>
          )}
        </p>
      </footer>
    </div>
  );
}
