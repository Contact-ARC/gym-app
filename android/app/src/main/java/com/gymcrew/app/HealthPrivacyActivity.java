package com.gymcrew.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/**
 * Health Connect opens this from its permission screen ("Read privacy policy") and from
 * Settings → Apps → Gym Crew → permission usage. It shows the app's privacy policy in the browser.
 */
public class HealthPrivacyActivity extends Activity {
    static final String URL = "https://arc-suite.com/gym-crew/privacy/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(URL)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException e) {
            // No browser: nothing more we can do
        }
        finish();
    }
}
