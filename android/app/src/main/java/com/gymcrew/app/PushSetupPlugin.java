package com.gymcrew.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Was this APK built with Firebase (google-services.json)? Crew notifications need it, and asking
 * Firebase for a token without it would crash the app, so the app checks here first.
 *
 * JS: registerPlugin('PushSetup').status() → { firebase: boolean }
 */
@CapacitorPlugin(name = "PushSetup")
public class PushSetupPlugin extends Plugin {

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        // The google-services Gradle plugin turns google-services.json into this string resource
        int id = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        r.put("firebase", id != 0);
        call.resolve(r);
    }
}
