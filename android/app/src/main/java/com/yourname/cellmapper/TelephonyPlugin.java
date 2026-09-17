package com.yourname.cellmapper;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.telephony.CellIdentityGsm;
import android.telephony.CellIdentityLte;
import android.telephony.CellIdentityNr;
import android.telephony.CellInfo;
import android.telephony.CellInfoGsm;
import android.telephony.CellInfoLte;
import android.telephony.CellInfoNr;
import android.telephony.CellSignalStrengthGsm;
import android.telephony.CellSignalStrengthLte;
import android.telephony.CellSignalStrengthNr;
import android.telephony.TelephonyManager;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.List;

@CapacitorPlugin(
    name = "TelephonyPlugin",
    permissions = {
        @Permission(alias = "location", strings = {
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        }),
        @Permission(alias = "phone", strings = { Manifest.permission.READ_PHONE_STATE })
    }
)
public class TelephonyPlugin extends Plugin {

    @PluginMethod
    public void getNetworkMetrics(PluginCall call) {
        if (!hasTelephonyPermissions()) {
            call.reject("Location and READ_PHONE_STATE permissions are required to read cell info.");
            return;
        }

        TelephonyManager telephonyManager = (TelephonyManager) getContext().getSystemService(Context.TELEPHONY_SERVICE);
        if (telephonyManager == null) {
            call.reject("Unable to access TelephonyManager.");
            return;
        }

        List<CellInfo> cellInfoList;
        try {
            cellInfoList = telephonyManager.getAllCellInfo();
        } catch (SecurityException e) {
            call.reject("Location and READ_PHONE_STATE permissions are required to read cell info.");
            return;
        }
        if (cellInfoList == null || cellInfoList.isEmpty()) {
            call.reject("No cell information available. Ensure airplane mode is off and permissions are granted.");
            return;
        }

        JSArray cells = new JSArray();
        CellInfo registeredCell = null;

        // Prefer the registered cell tower.
        for (CellInfo info : cellInfoList) {
            if (info.isRegistered()) {
                registeredCell = info;
                break;
            }
        }

        // Build the primary metrics from the registered cell.
        JSObject primary = new JSObject();
        if (registeredCell != null) {
            populateCellData(registeredCell, primary);
        }

        // Build a list of all observed cells for neighbor awareness.
        for (CellInfo info : cellInfoList) {
            JSObject cellObj = new JSObject();
            populateCellData(info, cellObj);
            cells.put(cellObj);
        }

        JSObject result = new JSObject();
        result.put("registered", primary);
        result.put("allCells", cells);
        result.put("timestamp", System.currentTimeMillis());
        call.resolve(result);
    }

    // NOTE: Do NOT define checkPermissions/requestPermissions here. The base
    // Plugin class already exposes them (driven by the @CapacitorPlugin
    // permissions above) and returns per-alias states such as
    // granted/denied/prompt/prompt-with-rationale. Overriding them with
    // @PluginMethod shadows the framework implementation, and the old
    // saveCall() + deprecated pluginRequestAllPermissions() path never invoked
    // a @PermissionCallback, so the system dialog never appeared and the JS
    // promise never resolved.

    private void populateCellData(CellInfo info, JSObject out) {
        out.put("registered", info.isRegistered());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && info instanceof CellInfoNr) {
            CellInfoNr nr = (CellInfoNr) info;
            CellIdentityNr identity = (CellIdentityNr) nr.getCellIdentity();
            CellSignalStrengthNr signal = (CellSignalStrengthNr) nr.getCellSignalStrength();

            out.put("type", "NR");
            out.put("mcc", identity.getMccString());
            out.put("mnc", identity.getMncString());
            out.put("tac", identity.getTac() != Integer.MAX_VALUE ? identity.getTac() : null);
            out.put("pci", identity.getPci() != Integer.MAX_VALUE ? identity.getPci() : null);
            out.put("nrarfcn", identity.getNrarfcn() != Integer.MAX_VALUE ? identity.getNrarfcn() : null);
            out.put("ssRsrp", signal.getSsRsrp() != Integer.MAX_VALUE ? signal.getSsRsrp() : null);
            out.put("ssRsrq", signal.getSsRsrq() != Integer.MAX_VALUE ? signal.getSsRsrq() : null);
            out.put("ssSinr", signal.getSsSinr() != Integer.MAX_VALUE ? signal.getSsSinr() : null);
        } else if (info instanceof CellInfoLte) {
            CellInfoLte lte = (CellInfoLte) info;
            CellIdentityLte identity = lte.getCellIdentity();
            CellSignalStrengthLte signal = lte.getCellSignalStrength();

            out.put("type", "LTE");
            out.put("mcc", identity.getMcc() != Integer.MAX_VALUE ? identity.getMcc() : null);
            out.put("mnc", identity.getMnc() != Integer.MAX_VALUE ? identity.getMnc() : null);
            out.put("tac", identity.getTac() != Integer.MAX_VALUE ? identity.getTac() : null);
            out.put("ci", identity.getCi() != Integer.MAX_VALUE ? identity.getCi() : null);
            out.put("pci", identity.getPci() != Integer.MAX_VALUE ? identity.getPci() : null);
            out.put("earfcn", identity.getEarfcn() != Integer.MAX_VALUE ? identity.getEarfcn() : null);
            out.put("rsrp", signal.getRsrp() != Integer.MAX_VALUE ? signal.getRsrp() : null);
            out.put("rsrq", signal.getRsrq() != Integer.MAX_VALUE ? signal.getRsrq() : null);
            out.put("rssnr", signal.getRssnr() != Integer.MAX_VALUE ? signal.getRssnr() : null);
            out.put("cqi", signal.getCqi() != Integer.MAX_VALUE ? signal.getCqi() : null);
            out.put("asu", signal.getAsuLevel() != -1 ? signal.getAsuLevel() : null);
            out.put("level", signal.getLevel());
            out.put("dbm", signal.getDbm());
        } else if (info instanceof CellInfoGsm) {
            CellInfoGsm gsm = (CellInfoGsm) info;
            CellIdentityGsm identity = gsm.getCellIdentity();
            CellSignalStrengthGsm signal = gsm.getCellSignalStrength();

            out.put("type", "GSM");
            out.put("mcc", identity.getMcc() != Integer.MAX_VALUE ? identity.getMcc() : null);
            out.put("mnc", identity.getMnc() != Integer.MAX_VALUE ? identity.getMnc() : null);
            out.put("lac", identity.getLac() != Integer.MAX_VALUE ? identity.getLac() : null);
            out.put("cid", identity.getCid() != Integer.MAX_VALUE ? identity.getCid() : null);
            out.put("asu", signal.getAsuLevel() != -1 ? signal.getAsuLevel() : null);
            out.put("dbm", signal.getDbm());
            out.put("level", signal.getLevel());
        } else {
            out.put("type", "UNKNOWN");
        }
    }

    private boolean hasTelephonyPermissions() {
        Context ctx = getContext();
        boolean fineLocation = ActivityCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarseLocation = ActivityCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean phoneState = ActivityCompat.checkSelfPermission(ctx, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED;
        return (fineLocation || coarseLocation) && phoneState;
    }
}
