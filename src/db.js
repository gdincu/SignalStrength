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
    features: readings.map((r) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [r.lng, r.lat],
      },
      properties: {
        rsrp: r.rsrp,
        rsrq: r.rsrq,
        cellId: r.cellId,
        type: r.type,
        timestamp: r.timestamp,
        pci: r.pci,
        tac: r.tac,
        mcc: r.mcc,
        mnc: r.mnc,
      },
    })),
  };
}
