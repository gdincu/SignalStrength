import { Capacitor, registerPlugin } from '@capacitor/core';

export const Telephony = registerPlugin('TelephonyPlugin');

function isWeb() {
  try {
    return Capacitor.getPlatform() === 'web';
  } catch {
    return typeof window !== 'undefined';
  }
}

export async function getNetworkMetrics() {
  // On desktop web there is no TelephonyManager. Return UNKNOWN quietly so
  // the UI can still demo GPS tracking without console/status spam.
  if (isWeb()) {
    return { registered: { type: 'UNKNOWN' }, timestamp: Date.now() };
  }
  try {
    return await Telephony.getNetworkMetrics();
  } catch (error) {
    console.error('Telephony plugin error:', error);
    return { error: error?.message || String(error) };
  }
}

export async function requestTelephonyPermissions() {
  // Web has no phone permission — allow GPS-only tracking demo.
  if (isWeb()) {
    return { granted: true, location: 'granted', phone: 'granted' };
  }
  try {
    const status = await Telephony.requestPermissions();
    return normalizePermissionStatus(status);
  } catch (error) {
    console.error('Permission request error:', error);
    return { granted: false, location: 'prompt', phone: 'prompt', error: error?.message || String(error) };
  }
}

export async function checkTelephonyPermissions() {
  if (isWeb()) {
    return { granted: true, location: 'granted', phone: 'granted' };
  }
  try {
    const status = await Telephony.checkPermissions();
    return normalizePermissionStatus(status);
  } catch (error) {
    console.error('Permission check error:', error);
    return { granted: false, location: 'prompt', phone: 'prompt', error: error?.message || String(error) };
  }
}

// Capacitor's built-in checkPermissions/requestPermissions return one entry
// per @Permission alias: granted | denied | prompt | prompt-with-rationale.
// Only 'granted' counts as granted — everything else must trigger a request.
function normalizePermissionStatus(status) {
  const location = status?.location ?? 'prompt';
  const phone = status?.phone ?? 'prompt';
  const granted = location === 'granted' && phone === 'granted';
  return { granted, location, phone };
}

export function normalizeSignal(metric) {
  if (!metric) return null;

  const registered = metric.registered || {};
  const type = registered.type;

  if (type === 'NR') {
    // cellId is the global NCI (36-bit). PCI is physical and repeats every
    // few km, so it must never be used as the cell identity.
    const nci = registered.nci ?? null;
    return {
      type: 'NR',
      rsrp: registered.ssRsrp ?? null,
      rsrq: registered.ssRsrq ?? null,
      sinr: registered.ssSinr ?? null,
      pci: registered.pci ?? null,
      nci,
      cellId: nci,
      tac: registered.tac ?? null,
      mcc: registered.mcc ?? null,
      mnc: registered.mnc ?? null,
      nrarfcn: registered.nrarfcn ?? null,
      level: null,
      dbm: null,
    };
  }

  if (type === 'LTE') {
    const ci = registered.ci ?? null;
    return {
      type: 'LTE',
      rsrp: registered.rsrp ?? null,
      rsrq: registered.rsrq ?? null,
      rssnr: registered.rssnr ?? null,
      cqi: registered.cqi ?? null,
      pci: registered.pci ?? null,
      ci,
      cellId: ci ?? registered.pci ?? null,
      tac: registered.tac ?? null,
      mcc: registered.mcc ?? null,
      mnc: registered.mnc ?? null,
      earfcn: registered.earfcn ?? null,
      asu: registered.asu ?? null,
      level: registered.level ?? null,
      dbm: registered.dbm ?? null,
    };
  }

  if (type === 'GSM') {
    const cid = registered.cid ?? null;
    const lac = registered.lac ?? null;
    return {
      type: 'GSM',
      rsrp: null,
      rsrq: null,
      pci: null,
      cid,
      lac,
      cellId: cid,
      tac: lac,
      mcc: registered.mcc ?? null,
      mnc: registered.mnc ?? null,
      asu: registered.asu ?? null,
      level: registered.level ?? null,
      dbm: registered.dbm ?? null,
    };
  }

  if (type === 'WCDMA') {
    const cid = registered.cid ?? null;
    const lac = registered.lac ?? null;
    return {
      type: 'WCDMA',
      rsrp: null,
      rsrq: null,
      pci: null,
      cid,
      lac,
      cellId: cid,
      tac: lac,
      mcc: registered.mcc ?? null,
      mnc: registered.mnc ?? null,
      uarfcn: registered.uarfcn ?? null,
      psc: registered.psc ?? null,
      asu: registered.asu ?? null,
      level: registered.level ?? null,
      dbm: registered.dbm ?? null,
    };
  }

  return {
    type: type || 'UNKNOWN',
    rsrp: null,
    rsrq: null,
    cellId: null,
    dbm: null,
    level: null,
  };
}

export function getRsrpColor(rsrp) {
  if (rsrp == null) return '#9ca3af';
  if (rsrp >= -80) return '#22c55e'; // Excellent (green)
  if (rsrp >= -95) return '#84cc16'; // Good (lime)
  if (rsrp >= -110) return '#eab308'; // Fair (yellow)
  return '#ef4444'; // Poor (red)
}

export function getRsrqColor(rsrq) {
  if (rsrq == null) return '#9ca3af';
  if (rsrq >= -10) return '#22c55e'; // Excellent (green)
  if (rsrq >= -15) return '#84cc16'; // Good (lime)
  if (rsrq >= -20) return '#eab308'; // Fair (yellow)
  return '#ef4444'; // Poor (red)
}

export function getDbmColor(dbm) {
  if (dbm == null) return '#9ca3af';
  if (dbm >= -70) return '#22c55e';
  if (dbm >= -85) return '#84cc16';
  if (dbm >= -100) return '#eab308';
  return '#ef4444';
}

// Unified marker color: prefer RSRP (LTE/NR), fall back to dBm (GSM/WCDMA)
// so 2G/3G areas don't render as permanent grey "no data".
export function getSignalColor(signal) {
  if (!signal) return '#9ca3af';
  if (signal.rsrp != null) return getRsrpColor(signal.rsrp);
  if (signal.dbm != null) return getDbmColor(signal.dbm);
  return '#9ca3af';
}
