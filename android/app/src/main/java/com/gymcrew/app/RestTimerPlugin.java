package com.gymcrew.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
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
 * The rest timer as an ongoing notification that counts down by itself.
 *
 * Android draws the countdown (a chronometer counting down to the end time), so it keeps
 * ticking while the app is in the background or the screen is off, with no app code running.
 * It removes itself when the time is up; the "Get ready" alert is a separate scheduled
 * notification (see native.js).
 *
 * JS: registerPlugin('RestTimer') → show({ endsAt, title, body, channelName, channelDescription }), hide(),
 *     status() → { enabled, countdownChannel, readyChannel, exact, sdk }, openSettings()
 */
@CapacitorPlugin(name = "RestTimer")
public class RestTimerPlugin extends Plugin {

    private static final String CHANNEL_ID = "rest_countdown";
    private static final int NOTIFICATION_ID = 4243;

    private NotificationManager manager() {
        return (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    }

    /** Quiet channel: no sound, no vibration, no pop-up. It just sits in the status bar and shade. */
    private void ensureChannel(String name, String description) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager m = manager();
        if (m == null || m.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_LOW);
        ch.setDescription(description);
        ch.setShowBadge(false);
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        m.createNotificationChannel(ch);
    }

    @PluginMethod
    public void show(PluginCall call) {
        // A millisecond timestamp arrives as a Long, which PluginCall.getDouble() doesn't accept
        // (it returns null for Longs), so read the raw number whatever its type
        Object raw = call.getData().opt("endsAt");
        if (!(raw instanceof Number)) {
            call.reject("endsAt is required");
            return;
        }
        long endsAt = ((Number) raw).longValue();
        long left = endsAt - System.currentTimeMillis();
        NotificationManager m = manager();
        if (m == null) {
            call.resolve();
            return;
        }
        if (left <= 0) {
            m.cancel(NOTIFICATION_ID);
            call.resolve();
            return;
        }

        Context ctx = getContext();
        ensureChannel(call.getString("channelName", "Rest timer"), call.getString("channelDescription", ""));

        // Tapping it opens the app where you left it
        PendingIntent open = null;
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch != null) {
            launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            open = PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(ctx, CHANNEL_ID)
            : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_stat_rest)
            .setContentTitle(call.getString("title", "Resting"))
            .setContentText(call.getString("body", ""))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(true)
            .setWhen(endsAt)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setColor(0xFF2457B5);
        if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(left);
        if (Build.VERSION.SDK_INT >= 30) b.setCategory(Notification.CATEGORY_STOPWATCH);
        if (open != null) b.setContentIntent(open);

        try {
            m.notify(NOTIFICATION_ID, b.build());
        } catch (SecurityException e) {
            // Notifications turned off for the app: nothing to show
        }
        call.resolve();
    }

    /**
     * Can the app show the rest notifications? enabled: notifications allowed for the app at all;
     * *Channel: the channel's importance (0 = turned off by the user, -1 = not created yet);
     * exact: alarms can fire on time.
     */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        NotificationManager m = manager();
        r.put("enabled", m != null && m.areNotificationsEnabled());
        if (Build.VERSION.SDK_INT >= 26 && m != null) {
            NotificationChannel countdown = m.getNotificationChannel(CHANNEL_ID);
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

    @PluginMethod
    public void hide(PluginCall call) {
        NotificationManager m = manager();
        if (m != null) m.cancel(NOTIFICATION_ID);
        call.resolve();
    }
}
