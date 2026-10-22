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
 * Rest notifications, only while you're out of the app: a countdown, then a "Get ready" alert.
 *
 * The app "arms" them when a rest starts. Nothing shows while you stay in the app (it has its own
 * timer and chime). The moment you leave, this posts the countdown (Android's onPause, so it doesn't
 * depend on the app's JavaScript still running), and it disappears again when you come back.
 * Swiping it away while time is left brings it back (RestCountdownReceiver). At the end an exact
 * alarm fires RestAlarmReceiver, which swaps the countdown for the alert unless you're in the app.
 *
 * JS: registerPlugin('RestTimer') →
 *   arm({ endsAt, title, body, alertTitle, alertBody, doneTitle, channelName, channelDescription, alertChannelName,
 *         alertChannelDescription }), disarm(),
 *   show({ … }) / hide() (show right now, for the test in Settings),
 *   status() → { enabled, countdownChannel, readyChannel, exact, sdk, liveUpdates }, openSettings({ which })
 */
@CapacitorPlugin(name = "RestTimer")
public class RestTimerPlugin extends Plugin {

    // Read by RestCountdownReceiver
    static volatile boolean inForeground = false; // set by onResume; false after Android restarts the process in the background
    static volatile long armedEndsAt = 0;
    private static String armedTitle = "";
    private static String armedBody = "";
    private static String armedAlertTitle = "";
    private static String armedAlertBody = "";
    private static String armedDoneTitle = "Go!";

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
        String alertName = call.getString("alertChannelName", null);
        if (alertName != null) RestAlarmReceiver.channelName = alertName;
        String alertDescription = call.getString("alertChannelDescription", null);
        if (alertDescription != null) RestAlarmReceiver.channelDescription = alertDescription;
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
        armedAlertTitle = call.getString("alertTitle", "Get ready");
        armedAlertBody = call.getString("alertBody", "");
        armedDoneTitle = call.getString("doneTitle", "Go!");
        Context ctx = getContext();
        RestAlarmReceiver.cancelShown(ctx);
        RestAlarmReceiver.schedule(ctx, endsAt, armedAlertTitle, armedAlertBody); // backup if the service is stopped
        if (inForeground) RestCountdown.cancel(ctx);
        else showOutside(ctx);
        call.resolve();
    }

    /** Out of the app mid-rest: the countdown, kept alive by the foreground service (plain notification if that's not allowed). */
    private static void showOutside(Context ctx) {
        if (armedEndsAt == 0) return;
        if (!RestTimerService.start(ctx, armedEndsAt, armedTitle, armedBody, armedAlertTitle, armedAlertBody, armedDoneTitle)) {
            RestCountdown.post(ctx, armedEndsAt, armedTitle, armedBody);
        }
    }

    /** The rest stopped. Skipped early: call off the alert too. Time's up: leave the alarm alone (it may run a little late). */
    @PluginMethod
    public void disarm(PluginCall call) {
        Context ctx = getContext();
        if (armedEndsAt != 0 && armedEndsAt - System.currentTimeMillis() > 1000) {
            RestAlarmReceiver.unschedule(ctx);
            RestTimerService.stop(ctx);
        }
        armedEndsAt = 0;
        RestCountdown.cancel(ctx);
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
        showOutside(getContext());
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        inForeground = true;
        RestTimerService.stop(getContext());
        RestCountdown.cancel(getContext());
        RestAlarmReceiver.cancelShown(getContext()); // back in the app: the alert has done its job
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
            NotificationChannel ready = m.getNotificationChannel(RestAlarmReceiver.CHANNEL_ID);
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
        // The last few "Get ready" alerts (who fired them, how late, what happened)
        r.put("alerts", RestAlarmReceiver.recent(getContext()));
        // Android 16 Live Updates allowed for the app (null where the phone doesn't have them)
        if (Build.VERSION.SDK_INT >= 36 && m != null) {
            try {
                Object ok = NotificationManager.class.getMethod("canPostPromotedNotifications").invoke(m);
                if (ok instanceof Boolean) r.put("liveUpdates", (boolean) (Boolean) ok);
            } catch (Throwable ignored) {
                // not on this build
            }
        }
        call.resolve(r);
    }

    /** Open Android's notification settings for this app ({ which: 'liveUpdates' } for the Live Updates screen). */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Context ctx = getContext();
        Intent i = null;
        if ("liveUpdates".equals(call.getString("which", "")) && Build.VERSION.SDK_INT >= 36) {
            try {
                Object action = Settings.class.getField("ACTION_MANAGE_APP_PROMOTED_NOTIFICATIONS").get(null);
                if (action instanceof String) {
                    i = new Intent((String) action);
                    i.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
                }
            } catch (Throwable ignored) {
                // not on this build: fall back to the app's notification settings
            }
        }
        if (i == null && Build.VERSION.SDK_INT >= 26) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
        } else if (i == null) {
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
