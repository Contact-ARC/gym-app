package com.gymcrew.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-specific plugins must be registered before the bridge starts
        registerPlugin(RestTimerPlugin.class);
        registerPlugin(PushSetupPlugin.class);
        registerPlugin(HealthBridgePlugin.class); // 0.13: Health Connect (Kotlin)
        super.onCreate(savedInstanceState);
    }
}
