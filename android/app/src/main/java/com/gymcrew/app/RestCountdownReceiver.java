package com.gymcrew.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * The countdown was swiped away (or cleared) while the rest is still running: post it again.
 * Android 14+ lets you swipe away any ongoing notification when the phone is unlocked;
 * this puts it straight back, the way VPN apps do. Once the time is up it stays gone.
 */
public class RestCountdownReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent == null || !RestCountdown.ACTION_DISMISSED.equals(intent.getAction())) return;
        long endsAt = intent.getLongExtra(RestCountdown.EXTRA_ENDS_AT, 0L);
        // Back in the app (it shows its own timer there)
        if (RestTimerPlugin.inForeground) return;
        // The service re-posts it within a second anyway (with the live time)
        if (RestTimerService.running) return;
        // A newer rest has replaced this one. (0 means Android restarted the app's process since:
        // the notification itself still knows when the rest ends, so trust that.)
        long armed = RestTimerPlugin.armedEndsAt;
        if (armed != 0 && armed != endsAt) return;
        if (endsAt - System.currentTimeMillis() <= 1500) {
            // Swiped the "Go!" Live Update after the rest: you've seen it, so stop keeping it up
            if (RestTimerService.running && endsAt <= System.currentTimeMillis()) RestTimerService.stop(ctx);
            return;
        }
        String title = intent.getStringExtra(RestCountdown.EXTRA_TITLE);
        String body = intent.getStringExtra(RestCountdown.EXTRA_BODY);
        RestCountdown.post(ctx, endsAt, title != null ? title : "Resting", body != null ? body : "");
    }
}
