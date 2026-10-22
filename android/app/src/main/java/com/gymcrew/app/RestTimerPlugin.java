package com.gymcrew.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Rest countdown in the notification shade, only while you're out of the app.
 *
 * The app "arms" it when a rest starts. Nothing shows while you stay in the app (it has its own
 * timer and chime). The moment you leave, this posts the countdown (Android's onPause, so it doesn't
 * depend on the app's JavaScript still running), and it disappears again when you come back.
 * Swiping it away while time is left brings it back (RestCountdownReceiver). It removes itself
 * when the time is up; the "Get ready" alert is a separate scheduled notification (native.js).
 *
 * JS: registerPlugin('RestTimer') →
 *   arm({ endsAt, title, body, channelName, channelDescription }), disarm(),
 *   show({ … }) / hide() (show right now, for the test in Settings),
 *   status() → { enabled, countdownChannel, readyChannel, exact, sdk }, openSettings()
 */
@CapacitorPlugin(name = "RestTimer")
public class RestTimerPlugin extends Plugin {

    // Read by RestCountdownReceiver
    static volatile boolean inForeground = false; // set by onResume; false after Android restarts the process in the background
    static volatile long armedEndsAt = 0;
    private static String armedTitle = "";
    private static String armedBody = "";

    /** A millisecond timestamp arrives as a Long, which PluginCall.getDouble() rejects, so read the raw number. */
    private static long endsAtOf(PluginCall call) {
        Object raw = call.getData().opt("endsAt");
        return raw instanceof Number ? ((Number) raw).longValue() : 0L;
    }

    private void rememberChannelText(PluginCall call) {
        String name = call.getString("channelName", null);
        if (name != null) RestCountdown.channelName = name;
        String description = call.getString("channelDescription", null);
        if (description != null) RestCountdown.channelDescription = description;
    }

    @PluginMethod
    public void arm(PluginCall call) {
        long endsAt = endsAtOf(call);
        if (endsAt == 0) {
            call.reject("endsAt is required");
            return;
        }
        rememberChannelText(call);
        armedEndsAt = endsAt;
        armedTitle = call.getString("title", "Resting");
        armedBody = call.getString("body", "");
        if (inForeground) RestCountdown.cancel(getContext());
        else RestCountdown.post(getContext(), armedEndsAt, armedTitle, armedBody); // e.g. +30 s from the notification's app
        call.resolve();
    }

    @PluginMethod
    public void disarm(PluginCall call) {
        armedEndsAt = 0;
        RestCountdown.cancel(getContext());
        call.resolve();
    }

    /** Show it now, whatever the app's state (the test in Settings). */
    @PluginMethod
    public void show(PluginCall call) {
        long endsAt = endsAtOf(call);
        if (endsAt == 0) {
            call.reject("endsAt is required");
            return;
        }
        rememberChannelText(call);
        RestCountdown.post(getContext(), endsAt, call.getString("title", "Resting"), call.getString("body", ""));
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        RestCountdown.cancel(getContext());
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        inForeground = false;
        if (armedEndsAt != 0) RestCountdown.post(getContext(), armedEndsAt, armedTitle, armedBody);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        inForeground = true;
        RestCountdown.cancel(getContext());
        if (armedEndsAt != 0 && armedEndsAt <= System.currentTimeMillis()) armedEndsAt = 0;
    }

    /**
     * Can the app show the rest notifications? enabled: notifications allowed for the app at all;
     * *Channel: the channel's importance (0 = turned off by the user, -1 = not created yet);
     * exact: alarms can fire on time.
     */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        NotificationManager m = RestCountdown.manager(getContext());
        r.put("enabled", m != null && m.areNotificationsEnabled());
        if (Build.VERSION.SDK_INT >= 26 && m != null) {
            NotificationChannel countdown = m.getNotificationChannel(RestCountdown.CHANNEL_ID);
            NotificationChannel ready = m.getNotificationChannel("rest_ready");
            r.put("countdownChannel", countdown == null ? -1 : countdown.getImportance());
            r.put("readyChannel", ready == null ? -1 : ready.getImportance());
        }
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= 31) {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            exact = am == null || am.canScheduleExactAlarms();
        }
        r.put("exact", exact);
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    /** Open Android's notification settings for this app. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Context ctx = getContext();
        Intent i;
        if (Build.VERSION.SDK_INT >= 26) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
        } else {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.fromParts("package", ctx.getPackageName(), null));
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't open the settings");
        }
    }
}
