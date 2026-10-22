package com.gymcrew.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/**
 * The rest countdown notification, shared by the plugin (posts it when you leave the app)
 * and the receiver (posts it again if you swipe it away while time is left).
 *
 * Android draws the countdown itself (a chronometer counting down to the end time), so it keeps
 * ticking with the app in the background or the screen off, without any app code running.
 */
final class RestCountdown {

    static final String CHANNEL_ID = "rest_live";
    static final String OLD_CHANNEL_ID = "rest_countdown"; // 0.5.1–0.5.2: quiet, no pop-up
    static final int NOTIFICATION_ID = 4243;
    static final String ACTION_DISMISSED = "com.gymcrew.app.REST_COUNTDOWN_DISMISSED";
    static final String EXTRA_ENDS_AT = "endsAt";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_BODY = "body";

    // Channel name and description in the app's language, remembered from the last call from the app
    static String channelName = "Rest countdown";
    static String channelDescription = "";

    private RestCountdown() {}

    static NotificationManager manager(Context ctx) {
        return (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    /** Pops up once when posted (high importance) but makes no sound and doesn't vibrate. */
    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager m = manager(ctx);
        if (m == null) return;
        if (m.getNotificationChannel(OLD_CHANNEL_ID) != null) m.deleteNotificationChannel(OLD_CHANNEL_ID);
        if (m.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, channelName, NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(channelDescription);
        ch.setShowBadge(false);
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        m.createNotificationChannel(ch);
    }

    /** Post (or replace) the countdown. Does nothing once the time is up. */
    static void post(Context ctx, long endsAt, String title, String body) {
        long left = endsAt - System.currentTimeMillis();
        NotificationManager m = manager(ctx);
        if (m == null) return;
        if (left <= 1000) {
            m.cancel(NOTIFICATION_ID);
            return;
        }
        ensureChannel(ctx);

        // Tapping it opens the app where you left it
        PendingIntent open = null;
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch != null) {
            launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            open = PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        // Swiped away while time is left: the receiver puts it straight back (like a VPN notification)
        Intent dismissed = new Intent(ctx, RestCountdownReceiver.class);
        dismissed.setAction(ACTION_DISMISSED);
        dismissed.putExtra(EXTRA_ENDS_AT, endsAt);
        dismissed.putExtra(EXTRA_TITLE, title);
        dismissed.putExtra(EXTRA_BODY, body);
        PendingIntent onDismiss = PendingIntent.getBroadcast(ctx, 1, dismissed, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(ctx, CHANNEL_ID)
            : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_stat_rest)
            .setContentTitle(title)
            .setContentText(body)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(true)
            .setWhen(endsAt)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setColor(0xFF2457B5)
            .setDeleteIntent(onDismiss);
        if (open != null) b.setContentIntent(open);
        if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(left);
        if (Build.VERSION.SDK_INT >= 30) b.setCategory(Notification.CATEGORY_STOPWATCH);
        // Android 16: ask to show it as a Live Update (a chip with the time in the status bar).
        // Phones that don't support it simply ignore the request.
        if (Build.VERSION.SDK_INT >= 36) b.getExtras().putBoolean("android.requestPromotedOngoing", true);

        try {
            m.notify(NOTIFICATION_ID, b.build());
        } catch (SecurityException e) {
            // Notifications are off for the app: nothing to show
        }
    }

    static void cancel(Context ctx) {
        NotificationManager m = manager(ctx);
        if (m != null) m.cancel(NOTIFICATION_ID);
    }
}
