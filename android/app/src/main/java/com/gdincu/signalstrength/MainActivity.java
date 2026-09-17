package com.gdincu.signalstrength;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Must be called before super.onCreate() so the plugin is added to the
        // bridge before it is created. Without this, TelephonyPlugin is never
        // instantiated (capacitor.plugins.json is empty) and every
        // checkPermissions/requestPermissions/getNetworkMetrics call fails.
        registerPlugin(TelephonyPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
