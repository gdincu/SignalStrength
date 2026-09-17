import Dexie from 'dexie';

export const db = new Dexie('SignalStrengthDB');

db.version(1).stores({
  readings: '++id, timestamp, lat, lng, cellId, rsrp, rsrq, type',
});

export async function saveReading(reading) {
  return await db.readings.add(reading);
}

export async function getReadings() {
  return await db.readings.orderBy('timestamp').toArray();
}

export async function clearReadings() {
  return await db.readings.clear();
}

export async function exportGeoJSON() {
  const readings = await getReadings();
  return {
    type: 'FeatureCollection',
    // Export every stored field (accuracy, nci/cid, sinr/dbm/level,
    // arfcns, error, …) — not just the LTE/NR subset.
    features: readings.map((r) => {
      const { lat, lng, ...props } = r;
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lng, lat],
        },
        properties: { ...props },
      };
    }),
  };
}
