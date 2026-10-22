package com.gymcrew.app;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/**
 * Keeps the app awake while you're out of it mid-rest, so the "Get ready" alert fires on time.
 *
 * Some phones (OnePlus, Xiaomi, …) freeze apps shortly after they go to the background, and a frozen
 * app can't react to its alarm until it's woken up again. A foreground service — what music players
 * and the Clock app's timers use — isn't frozen. It runs only from the moment you leave the app during
 * a rest until the rest is over (or you come back), and its notification is the countdown itself.
 * The exact alarm (RestAlarmReceiver) stays as a backup in case the system stops the service anyway.
 */
public class RestTimerService extends Service {

    static final String EXTRA_ENDS_AT = "endsAt";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_BODY = "body";
    static final String EXTRA_ALERT_TITLE = "alertTitle";
    static final String EXTRA_ALERT_BODY = "alertBody";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable atEnd = null;

    /** Start it (when you leave the app mid-rest). Returns false if Android didn't allow it. */
    static boolean start(Context ctx, long endsAt, String title, String body, String alertTitle, String alertBody) {
        if (endsAt - System.currentTimeMillis() <= 1000) return false;
        Intent i = new Intent(ctx, RestTimerService.class);
        i.putExtra(EXTRA_ENDS_AT, endsAt);
        i.putExtra(EXTRA_TITLE, title);
        i.putExtra(EXTRA_BODY, body);
        i.putExtra(EXTRA_ALERT_TITLE, alertTitle);
        i.putExtra(EXTRA_ALERT_BODY, alertBody);
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
        final long endsAt = intent.getLongExtra(EXTRA_ENDS_AT, 0L);
        final String alertTitle = intent.getStringExtra(EXTRA_ALERT_TITLE);
        final String alertBody = intent.getStringExtra(EXTRA_ALERT_BODY);
        Notification n = RestCountdown.build(this, endsAt, intent.getStringExtra(EXTRA_TITLE), intent.getStringExtra(EXTRA_BODY));
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
            RestCountdown.post(this, endsAt, intent.getStringExtra(EXTRA_TITLE), intent.getStringExtra(EXTRA_BODY));
            stopSelf();
            return START_NOT_STICKY;
        }

        if (atEnd != null) handler.removeCallbacks(atEnd);
        atEnd = () -> {
            RestAlarmReceiver.fire(this, endsAt, alertTitle, alertBody);
            stopSelf();
        };
        handler.postDelayed(atEnd, Math.max(0L, endsAt - System.currentTimeMillis()));
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (atEnd != null) handler.removeCallbacks(atEnd);
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
