package com.gymcrew.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

/**
 * Keeps the app awake while you're out of it mid-rest, so the "Get ready" alert fires on time.
 *
 * Some phones (OnePlus, Xiaomi, …) freeze apps shortly after they go to the background, and a frozen
 * app can't react to its alarm until it's woken up again. A foreground service — what music players
 * and the Clock app's timers use — isn't frozen. It runs only from the moment you leave the app during
 * a rest until the rest is over (or you come back), and its notification is the countdown itself.
 *
 * Every second it re-posts the countdown with the time left as its title and Live Update text, so the
 * status-bar pill (a Live Alert on OnePlus) shows just the time. At zero it shows the "Get ready" alert
 * (sound, vibration) and turns the Live Update into "Go!", which stays until you're back in the app,
 * you swipe it away, or a few minutes pass. The exact alarm (RestAlarmReceiver) stays as a backup;
 * the alert is only ever shown once for each rest, whichever of the two gets there first.
 */
public class RestTimerService extends Service {

    static final String EXTRA_ENDS_AT = "endsAt";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_BODY = "body";
    static final String EXTRA_ALERT_TITLE = "alertTitle";
    static final String EXTRA_ALERT_BODY = "alertBody";
    static final String EXTRA_DONE_TITLE = "doneTitle";
    /** How long "Go!" stays up after the rest if you don't come back to the app. */
    static final long DONE_KEEP_MS = 3 * 60 * 1000;

    /** Read by RestCountdownReceiver: while this runs, it puts a swiped countdown back itself. */
    static volatile boolean running = false;

    private final Handler handler = new Handler(Looper.getMainLooper());
    // Keeps the CPU awake until the rest is over. Without it, a locked phone goes to sleep and the
    // Handler (which counts "awake time") stops: the countdown froze and the alert came late or not at all.
    private PowerManager.WakeLock wake = null;
    private long endsAt = 0;
    private String title = "";
    private String body = "";
    private String alertTitle = "";
    private String alertBody = "";
    private String doneTitle = "Go!";
    private final Runnable tick = this::tick;
    private final Runnable end = this::stopSelf;

    /** Start it (when you leave the app mid-rest). Returns false if Android didn't allow it. */
    static boolean start(Context ctx, long endsAt, String title, String body, String alertTitle, String alertBody, String doneTitle) {
        if (endsAt - System.currentTimeMillis() <= 1000) return false;
        Intent i = new Intent(ctx, RestTimerService.class);
        i.putExtra(EXTRA_ENDS_AT, endsAt);
        i.putExtra(EXTRA_TITLE, title);
        i.putExtra(EXTRA_BODY, body);
        i.putExtra(EXTRA_ALERT_TITLE, alertTitle);
        i.putExtra(EXTRA_ALERT_BODY, alertBody);
        i.putExtra(EXTRA_DONE_TITLE, doneTitle);
        try {
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
            else ctx.startService(i);
            return true;
        } catch (Exception e) {
            // Not allowed right now (background start limits): the plain notification and the alarm still work
            return false;
        }
    }

    static void stop(Context ctx) {
        try {
            ctx.stopService(new Intent(ctx, RestTimerService.class));
        } catch (Exception e) {
            // not running
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        handler.removeCallbacks(tick);
        handler.removeCallbacks(end);
        endsAt = intent.getLongExtra(EXTRA_ENDS_AT, 0L);
        title = intent.getStringExtra(EXTRA_TITLE);
        body = intent.getStringExtra(EXTRA_BODY);
        alertTitle = intent.getStringExtra(EXTRA_ALERT_TITLE);
        alertBody = intent.getStringExtra(EXTRA_ALERT_BODY);
        doneTitle = intent.getStringExtra(EXTRA_DONE_TITLE);

        Notification n = RestCountdown.build(this, endsAt, title, body, true);
        if (n == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(RestCountdown.NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(RestCountdown.NOTIFICATION_ID, n);
            }
        } catch (Exception e) {
            // Couldn't become a foreground service: show the countdown as a normal notification and rely on the alarm
            RestCountdown.post(this, endsAt, title, body);
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        holdAwake(endsAt - System.currentTimeMillis() + 15000);
        scheduleTick();
        return START_NOT_STICKY;
    }

    /** Stay awake for `ms` (capped at 20 minutes, the longest rest the app allows plus room). */
    private void holdAwake(long ms) {
        try {
            if (wake == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm == null) return;
                wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "GymCrew:rest");
                wake.setReferenceCounted(false);
            }
            wake.acquire(Math.max(1000L, Math.min(ms, 20 * 60 * 1000L)));
        } catch (Exception e) {
            // No wake lock: the exact alarm still covers the alert
        }
    }

    private void letSleep() {
        try {
            if (wake != null && wake.isHeld()) wake.release();
        } catch (Exception e) {
            // already released
        }
    }

    /** Next update right when the shown second changes. */
    private void scheduleTick() {
        long left = endsAt - System.currentTimeMillis();
        if (left <= 0) {
            handler.post(tick);
            return;
        }
        long delay = left % 1000;
        if (delay == 0) delay = 1000;
        handler.postDelayed(tick, delay + 10);
    }

    private void tick() {
        Notification n = RestCountdown.build(this, endsAt, title, body, true);
        if (n == null) {
            finish();
            return;
        }
        NotificationManager m = RestCountdown.manager(this);
        try {
            if (m != null) m.notify(RestCountdown.NOTIFICATION_ID, n);
        } catch (SecurityException e) {
            // Notifications turned off meanwhile: the alert can't show either
        }
        scheduleTick();
    }

    /** Time's up: the "Get ready" alert, and the Live Update turns into "Go!" for a while. */
    private void finish() {
        handler.removeCallbacks(tick);
        RestAlarmReceiver.fire(this, endsAt, alertTitle, alertBody, "timer");
        NotificationManager m = RestCountdown.manager(this);
        try {
            if (m != null) m.notify(RestCountdown.NOTIFICATION_ID, RestCountdown.buildDone(this, endsAt, doneTitle, title));
        } catch (SecurityException e) {
            // Notifications turned off meanwhile
        }
        handler.postDelayed(end, DONE_KEEP_MS);
        letSleep(); // the alert is out; "Go!" doesn't need the CPU
    }

    private void removeNotification() {
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        RestCountdown.cancel(this);
    }

    @Override
    public void onDestroy() {
        running = false;
        letSleep();
        handler.removeCallbacks(tick);
        handler.removeCallbacks(end);
        removeNotification();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
