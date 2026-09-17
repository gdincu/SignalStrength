import { registerPlugin } from '@capacitor/core';

export const Telephony = registerPlugin('TelephonyPlugin');

export async function getNetworkMetrics() {
  try {
    return await Telephony.getNetworkMetrics();
  } catch (error) {
    console.error('Telephony plugin error:', error);
    return { error: error?.message || String(error) };
  }
}

export async function requestTelephonyPermissions() {
  try {
    const status = await Telephony.requestPermissions();
    return normalizePermissionStatus(status);
  } catch (error) {
    console.error('Permission request error:', error);
    return { granted: false, location: 'prompt', phone: 'prompt', error: error?.message || String(error) };
  }
}

export async function checkTelephonyPermissions() {
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
    return {
      type: 'NR',
      rsrp: registered.ssRsrp ?? null,
      rsrq: registered.ssRsrq ?? null,
      sinr: registered.ssSinr ?? null,
      pci: registered.pci ?? null,
      tac: registered.tac ?? null,
      mcc: registered.mcc ?? null,
      mnc: registered.mnc ?? null,
      cellId: registered.pci ?? null,
      level: null,
    };
  }

  if (type === 'LTE') {
    return {
      type: 'LTE',
      rsrp: registered.rsrp ?? null,
      rsrq: registered.rsrq ?? null,
      rssnr: registered.rssnr ?? null,
      cqi: registered.cqi ?? null,
      pci: registered.pci ?? null,
      ci: registered.ci ?? null,
      tac: registered.tac ?? null,
      mcc: registered.mcc ?? null,
      mnc: registered.mnc ?? null,
      cellId: registered.ci ?? registered.pci ?? null,
      level: registered.level ?? null,
      dbm: registered.dbm ?? null,
    };
  }

  if (type === 'GSM') {
    return {
      type: 'GSM',
      rsrp: null,
      rsrq: null,
      pci: null,
      ci: registered.cid ?? null,
      tac: registered.lac ?? null,
      mcc: registered.mcc ?? null,
      mnc: registered.mnc ?? null,
      cellId: registered.cid ?? null,
      level: registered.level ?? null,
      dbm: registered.dbm ?? null,
    };
  }

  return {
    type: type || 'UNKNOWN',
    rsrp: null,
    rsrq: null,
    cellId: null,
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
