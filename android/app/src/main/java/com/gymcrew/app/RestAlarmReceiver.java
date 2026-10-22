package com.gymcrew.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * The rest is over: replace the countdown with a "Get ready" alert (sound, vibration, pop-up),
 * unless you're in the app, which chimes and buzzes itself.
 *
 * Fired by an exact alarm set when the rest starts (RestTimerPlugin.arm), so it doesn't depend on
 * the app's JavaScript running, and the "are you in the app?" check happens right at the end.
 */
public class RestAlarmReceiver extends BroadcastReceiver {

    static final String ACTION_REST_OVER = "com.gymcrew.app.REST_OVER";
    static final String EXTRA_TITLE = "alertTitle";
    static final String EXTRA_BODY = "alertBody";
    static final String EXTRA_ENDS_AT = "endsAt";
    // Same id as the alert channel the app made in 0.5.1–0.5.3, so your pop-up settings for it carry over
    static final String CHANNEL_ID = "rest_ready";
    static final int NOTIFICATION_ID = 4244;

    static String channelName = "Rest is over";
    static String channelDescription = "";
    private static volatile long firedFor = 0; // the rest the alert was already shown for

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent == null || !ACTION_REST_OVER.equals(intent.getAction())) return;
        fire(ctx, intent.getLongExtra(EXTRA_ENDS_AT, 0L), intent.getStringExtra(EXTRA_TITLE), intent.getStringExtra(EXTRA_BODY));
    }

    /**
     * The rest that ends at `endsAt` is over: swap the countdown for the alert, once.
     * Called by RestTimerService on time, and by the alarm as a backup.
     */
    static synchronized void fire(Context ctx, long endsAt, String title, String body) {
        if (endsAt != 0 && endsAt == firedFor) return;
        // A newer rest replaced this one (its own timing will fire), or you're in the app (it chimes itself)
        long armed = RestTimerPlugin.armedEndsAt;
        if (armed != 0 && armed != endsAt) return;
        RestCountdown.cancel(ctx);
        if (RestTimerPlugin.inForeground) return;
        firedFor = endsAt;
        post(ctx, title != null ? title : "Get ready", body != null ? body : "");
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager m = RestCountdown.manager(ctx);
        if (m == null || m.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(channelDescription);
        ch.enableVibration(true);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        m.createNotificationChannel(ch); // default notification sound
    }

    static void post(Context ctx, String title, String body) {
        NotificationManager m = RestCountdown.manager(ctx);
        if (m == null) return;
        ensureChannel(ctx);
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
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setShowWhen(true)
            .setWhen(System.currentTimeMillis())
            .setCategory(Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setColor(0xFF2457B5);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        }
        if (open != null) b.setContentIntent(open);
        try {
            m.notify(NOTIFICATION_ID, b.build());
        } catch (SecurityException e) {
            // Notifications are off for the app
        }
    }

    static void cancelShown(Context ctx) {
        NotificationManager m = RestCountdown.manager(ctx);
        if (m != null) m.cancel(NOTIFICATION_ID);
    }

    private static PendingIntent alarmIntent(Context ctx, long endsAt, String title, String body) {
        Intent i = new Intent(ctx, RestAlarmReceiver.class);
        i.setAction(ACTION_REST_OVER);
        i.putExtra(EXTRA_ENDS_AT, endsAt);
        i.putExtra(EXTRA_TITLE, title);
        i.putExtra(EXTRA_BODY, body);
        return PendingIntent.getBroadcast(ctx, 2, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Exact alarm at the end of the rest (replaces any earlier one). */
    static void schedule(Context ctx, long endsAt, String title, String body) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = alarmIntent(ctx, endsAt, title, body);
        boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        try {
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, endsAt, pi);
        }
    }

    static void unschedule(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(alarmIntent(ctx, 0L, "", ""));
    }
}
