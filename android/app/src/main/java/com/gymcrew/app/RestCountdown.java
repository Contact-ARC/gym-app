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

    /** Post (or replace) the countdown as a normal notification. Does nothing once the time is up. */
    static void post(Context ctx, long endsAt, String title, String body) {
        NotificationManager m = manager(ctx);
        if (m == null) return;
        Notification n = build(ctx, endsAt, title, body);
        if (n == null) {
            m.cancel(NOTIFICATION_ID);
            return;
        }
        try {
            m.notify(NOTIFICATION_ID, n);
        } catch (SecurityException e) {
            // Notifications are off for the app: nothing to show
        }
    }

    /** The countdown notification, or null once the time is up. */
    static Notification build(Context ctx, long endsAt, String title, String body) {
        return build(ctx, endsAt, title, body, false);
    }

    /** Seconds left as m:ss, rounded up (so it reads 0:01 until the very end, like the app's timer). */
    static String clock(long leftMs) {
        long s = Math.max(0L, (leftMs + 999) / 1000);
        long sec = s % 60;
        return (s / 60) + ":" + (sec < 10 ? "0" : "") + sec;
    }

    /**
     * The countdown notification, or null once the time is up.
     *
     * live = false: Android counts down by itself (a chronometer), title "Next: …". Used when nothing in the
     *   app can update it (the plain fallback, and putting it back after a swipe).
     * live = true: RestTimerService re-posts it every second with the time left as the title and as the
     *   Live Update's short text, so the status-bar pill / OnePlus Live Alert reads just "1:23";
     *   "Next: …" moves to the line below, which you see when you open it.
     */
    static Notification build(Context ctx, long endsAt, String title, String body, boolean live) {
        long left = endsAt - System.currentTimeMillis();
        if (left <= (live ? 0 : 1000)) return null;
        if (title == null) title = "Resting";
        if (body == null) body = "";
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
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setColor(0xFF2457B5)
            .setDeleteIntent(onDismiss);
        if (live) {
            String time = clock(left);
            b.setContentTitle(time)
                .setContentText(title)
                .setShowWhen(false);
        } else {
            b.setContentTitle(title)
                .setContentText(body)
                .setShowWhen(true)
                .setWhen(endsAt)
                .setUsesChronometer(true)
                .setChronometerCountDown(true);
            if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(left);
        }
        if (open != null) b.setContentIntent(open);
        if (Build.VERSION.SDK_INT >= 30) b.setCategory(Notification.CATEGORY_STOPWATCH);
        // Android 16: ask to show it as a Live Update (the time in a status-bar chip, a Live Alert on OnePlus)
        if (Build.VERSION.SDK_INT >= 36) {
            requestPromoted(b);
            if (live) shortCriticalText(b, clock(left));
        }
        return b.build();
    }

    /**
     * After the rest: the same Live Update, now saying "Go!" (in the pill too) with "Next: …" underneath.
     * RestTimerService keeps it up until you're back in the app or a few minutes have passed.
     */
    static Notification buildDone(Context ctx, long endsAt, String doneTitle, String title) {
        if (doneTitle == null) doneTitle = "Go!";
        if (title == null) title = "";
        ensureChannel(ctx);
        PendingIntent open = null;
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch != null) {
            launch.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            open = PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }
        Intent dismissed = new Intent(ctx, RestCountdownReceiver.class);
        dismissed.setAction(ACTION_DISMISSED);
        dismissed.putExtra(EXTRA_ENDS_AT, endsAt);
        PendingIntent onDismiss = PendingIntent.getBroadcast(ctx, 1, dismissed, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(ctx, CHANNEL_ID)
            : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_stat_rest)
            .setContentTitle(doneTitle)
            .setContentText(title)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setColor(0xFF2457B5)
            .setDeleteIntent(onDismiss);
        if (open != null) b.setContentIntent(open);
        if (Build.VERSION.SDK_INT >= 30) b.setCategory(Notification.CATEGORY_STOPWATCH);
        if (Build.VERSION.SDK_INT >= 36) {
            requestPromoted(b);
            shortCriticalText(b, doneTitle);
        }
        return b.build();
    }

    /** The Live Update's text for the status-bar pill (setShortCriticalText, Android 16; looked up at run time). */
    static void shortCriticalText(Notification.Builder b, String text) {
        try {
            Notification.Builder.class.getMethod("setShortCriticalText", String.class).invoke(b, text);
            return;
        } catch (Throwable ignored) {
            // method not on this build
        }
        String key = "android.shortCriticalText";
        try {
            Object k = Notification.class.getField("EXTRA_SHORT_CRITICAL_TEXT").get(null);
            if (k instanceof String) key = (String) k;
        } catch (Throwable ignored) {
            // constant not on this build
        }
        b.getExtras().putString(key, text);
    }

    /**
     * Ask for Live Update treatment. setRequestPromotedOngoing() only exists on newer Android 16 builds,
     * so it's looked up at run time; older builds get the same request through the notification's extras.
     */
    static void requestPromoted(Notification.Builder b) {
        try {
            Notification.Builder.class.getMethod("setRequestPromotedOngoing", boolean.class).invoke(b, true);
            return;
        } catch (Throwable ignored) {
            // method not on this build
        }
        String key = "android.requestPromotedOngoing";
        try {
            Object k = Notification.class.getField("EXTRA_REQUEST_PROMOTED_ONGOING").get(null);
            if (k instanceof String) key = (String) k;
        } catch (Throwable ignored) {
            // constant not on this build
        }
        b.getExtras().putBoolean(key, true);
    }

    static void cancel(Context ctx) {
        NotificationManager m = manager(ctx);
        if (m != null) m.cancel(NOTIFICATION_ID);
    }
}
