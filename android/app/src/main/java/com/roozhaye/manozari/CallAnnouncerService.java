package com.roozhaye.manozari;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Base64;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

public class CallAnnouncerService extends Service {
    public static final String CHANNEL_ID = "rmz_call_announcer_channel";
    public static final int NOTIF_ID = 7002;
    public static final int ALERT_NOTIF_ID = 7003;
    public static final String EXTRA_TEXT = "spoken_text";
    public static final String EXTRA_TITLE = "notif_title";
    public static final String EXTRA_IS_MALE = "is_male";
    public static final String EXTRA_VOICE_NAME = "voice_name";
    public static final String EXTRA_REPEAT = "repeat_count";
    public static final String EXTRA_IS_CALL = "is_call";
    private static final String DEFAULT_API_BASE = "https://roozhaye-manozari-7.ai.studio";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private volatile boolean cancelled = false;
    private volatile int activeSessionId = 0;
    private MediaPlayer activePlayer = null;
    private PowerManager.WakeLock wakeLock = null;
    private AudioManager audioManager = null;
    private AudioFocusRequest focusRequest = null;

    public static void announce(Context context, String title, String text, boolean isMale, int repeatCount, boolean isCall) {
        SharedPreferences prefs = context.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        String defaultVoice = prefs.getString("default_voice_name", isMale ? "Charon" : "Kore");
        String resolvedVoice = defaultVoice;
        if (isMale && !"Charon".equals(defaultVoice) && !"Fenrir".equals(defaultVoice)) {
            resolvedVoice = "Charon";
        } else if (!isMale && ("Charon".equals(defaultVoice) || "Fenrir".equals(defaultVoice))) {
            resolvedVoice = "Kore";
        }
        announce(context, title, text, resolvedVoice, isMale, repeatCount, isCall);
    }

    public static void announce(Context context, String title, String text, String voiceName, boolean isMale, int repeatCount, boolean isCall) {
        Intent intent = new Intent(context, CallAnnouncerService.class);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_TEXT, text);
        intent.putExtra(EXTRA_IS_MALE, isMale);
        intent.putExtra(EXTRA_VOICE_NAME, voiceName);
        intent.putExtra(EXTRA_REPEAT, Math.max(1, Math.min(2, repeatCount)));
        intent.putExtra(EXTRA_IS_CALL, isCall);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
                return;
            }
            context.startService(intent);
        } catch (Exception e) {
            // Android 12+ may restrict startForegroundService from background if overlay/battery exemptions aren't granted yet.
            try {
                context.startService(intent);
            } catch (Exception ignored) {
                postDirectFallbackNotification(context, title, text);
            }
        }
    }

    public static void stopActive(Context context) {
        try {
            context.stopService(new Intent(context, CallAnnouncerService.class));
        } catch (Exception ignored) {
        }
    }

    public static boolean saveWavToCache(Context context, String text, String voiceName, byte[] wavBytes) {
        if (text == null || text.trim().isEmpty() || wavBytes == null || wavBytes.length <= 44) {
            return false;
        }
        try {
            File cacheDir = new File(context.getCacheDir(), "rmz_tts_wav");
            if (!cacheDir.exists()) {
                cacheDir.mkdirs();
            }
            String key = sha256Hex(voiceName + "::" + text.trim());
            File cachedFile = new File(cacheDir, key + ".wav");
            try (FileOutputStream fos = new FileOutputStream(cachedFile)) {
                fos.write(wavBytes);
            }
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "اعلام صوتی تماس و پیام‌ها",
                    NotificationManager.IMPORTANCE_LOW
            );
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        final int sessionId = ++activeSessionId;
        cancelled = false;
        stopActivePlayer();
        abandonAudioFocus();
        handler.removeCallbacksAndMessages(null);

        String title = intent != null ? intent.getStringExtra(EXTRA_TITLE) : "اعلام صوتی";
        String rawText = intent != null ? intent.getStringExtra(EXTRA_TEXT) : "";
        String text = rawText != null ? rawText.trim() : "";
        boolean isMale = intent != null && intent.getBooleanExtra(EXTRA_IS_MALE, false);
        String extraVoice = intent != null ? intent.getStringExtra(EXTRA_VOICE_NAME) : null;
        int repeat = intent != null ? Math.max(1, Math.min(2, intent.getIntExtra(EXTRA_REPEAT, 1))) : 1;
        boolean isCall = intent != null && intent.getBooleanExtra(EXTRA_IS_CALL, false);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title != null ? title : "روزهای من و زری")
                .setContentText(text)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, notification);
            }
        } catch (Exception ignored) {
            // Continue safely even if OS prevents FGS elevation in restricted background state
        }

        if (text.isEmpty()) {
            stopSelfSafely();
            return START_NOT_STICKY;
        }

        acquireWakeLock();

        final String voiceName = (extraVoice != null && !extraVoice.trim().isEmpty())
                ? extraVoice.trim()
                : (isMale ? "Charon" : "Kore");

        handler.postDelayed(() -> {
            if (cancelled || sessionId != activeSessionId) return;
            new Thread(() -> playOnlineOrFallback(sessionId, title, text, voiceName, isMale, repeat, isCall)).start();
        }, isCall ? 250 : 120);

        // Safety stop after 55s
        handler.postDelayed(() -> {
            if (sessionId == activeSessionId) {
                stopSelfSafely();
            }
        }, 55000);
        return START_NOT_STICKY;
    }

    private void playOnlineOrFallback(int sessionId, String title, String singleText, String voiceName, boolean isMale, int repeat, boolean isCall) {
        if (cancelled || sessionId != activeSessionId) return;

        File wavFile = fetchOrGetCachedWav(singleText, voiceName);
        if (cancelled || sessionId != activeSessionId) return;

        if (wavFile != null && wavFile.exists() && wavFile.length() > 44) {
            handler.post(() -> {
                if (cancelled || sessionId != activeSessionId) return;
                if (!playWavFile(sessionId, wavFile, repeat)) {
                    fallbackOfflineSpeak(sessionId, title, singleText, isMale, repeat, isCall);
                }
            });
            return;
        }

        handler.post(() -> {
            if (!cancelled && sessionId == activeSessionId) {
                fallbackOfflineSpeak(sessionId, title, singleText, isMale, repeat, isCall);
            }
        });
    }

    private void fallbackOfflineSpeak(int sessionId, String title, String singleText, boolean isMale, int repeat, boolean isCall) {
        String spoken = repeat == 2 ? (singleText + " . " + singleText) : singleText;
        BilingualSpeechHelper.speak(this, spoken, isMale, 1.0f, false, success -> {
            if (!success && sessionId == activeSessionId) {
                postDirectFallbackNotification(this, title != null ? title : "روزهای من و زری", singleText);
            }
            if (sessionId == activeSessionId) {
                stopSelfSafely();
            }
        });
    }

    private boolean playWavFile(int sessionId, File wavFile, int remainingPlays) {
        try {
            stopActivePlayer();
            requestTransientAudioFocus();

            MediaPlayer mp = new MediaPlayer();
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
            mp.setAudioAttributes(attrs);
            mp.setDataSource(wavFile.getAbsolutePath());
            mp.setOnCompletionListener(player -> {
                stopActivePlayer();
                if (cancelled || sessionId != activeSessionId) {
                    abandonAudioFocus();
                    return;
                }
                if (remainingPlays > 1) {
                    handler.postDelayed(() -> {
                        if (!cancelled && sessionId == activeSessionId) {
                            if (!playWavFile(sessionId, wavFile, remainingPlays - 1)) {
                                abandonAudioFocus();
                                stopSelfSafely();
                            }
                        }
                    }, 350);
                } else {
                    abandonAudioFocus();
                    stopSelfSafely();
                }
            });
            mp.setOnErrorListener((player, what, extra) -> {
                stopActivePlayer();
                abandonAudioFocus();
                if (sessionId == activeSessionId) {
                    stopSelfSafely();
                }
                return true;
            });
            mp.prepare();
            if (cancelled || sessionId != activeSessionId) {
                mp.release();
                abandonAudioFocus();
                return false;
            }
            activePlayer = mp;
            mp.start();
            return true;
        } catch (Exception ignored) {
            stopActivePlayer();
            abandonAudioFocus();
            return false;
        }
    }

    private File fetchOrGetCachedWav(String text, String voiceName) {
        try {
            File cacheDir = new File(getCacheDir(), "rmz_tts_wav");
            if (!cacheDir.exists()) {
                cacheDir.mkdirs();
            }
            String key = sha256Hex(voiceName + "::" + text.trim());
            File cachedFile = new File(cacheDir, key + ".wav");
            if (cachedFile.exists() && cachedFile.length() > 44) {
                return cachedFile;
            }

            SharedPreferences prefs = getSharedPreferences("rmz_native_prefs", MODE_PRIVATE);
            String baseUrl = prefs.getString("server_base_url", DEFAULT_API_BASE);
            if (baseUrl == null || baseUrl.trim().isEmpty()) {
                baseUrl = DEFAULT_API_BASE;
            }
            baseUrl = baseUrl.replaceAll("/+$", "");

            URL url = new URL(baseUrl + "/api/tts");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(15000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");

            JSONObject body = new JSONObject();
            String safeText = text.length() > 1200 ? text.substring(0, 1200) : text;
            body.put("text", safeText);
            body.put("voiceName", voiceName);
            body.put("style", "Clear fluent Tehran Persian and crisp English pronunciation announcer.");

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            if (conn.getResponseCode() != 200) {
                conn.disconnect();
                return null;
            }

            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = br.readLine()) != null) {
                    sb.append(line);
                }
            }
            conn.disconnect();

            JSONObject resp = new JSONObject(sb.toString());
            if (resp.optBoolean("fallbackOffline", false)) {
                return null;
            }
            String audioB64 = resp.optString("audioBase64", "");
            if (audioB64.isEmpty()) {
                return null;
            }

            byte[] wavBytes = Base64.decode(audioB64, Base64.DEFAULT);
            if (wavBytes.length <= 44) {
                return null;
            }
            try (FileOutputStream fos = new FileOutputStream(cachedFile)) {
                fos.write(wavBytes);
            }
            return cachedFile;
        } catch (Exception ignored) {
            return null;
        }
    }

    private void requestTransientAudioFocus() {
        if (audioManager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build();
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                        .setAudioAttributes(attrs)
                        .setAcceptsDelayedFocusGain(false)
                        .build();
                audioManager.requestAudioFocus(focusRequest);
            } else {
                audioManager.requestAudioFocus(
                        null,
                        AudioManager.STREAM_MUSIC,
                        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                );
            }
        } catch (Exception ignored) {
        }
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
                audioManager.abandonAudioFocusRequest(focusRequest);
                focusRequest = null;
            }
        } catch (Exception ignored) {
        }
    }

    private void acquireWakeLock() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "RoozhayeManOZari::AnnouncerWakeLock");
                    wakeLock.setReferenceCounted(false);
                }
            }
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(30000L);
            }
        } catch (Exception ignored) {
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception ignored) {
        }
    }

    private void stopSelfSafely() {
        abandonAudioFocus();
        releaseWakeLock();
        stopSelf();
    }

    private static void postDirectFallbackNotification(Context context, String title, String body) {
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID,
                        "اعلام صوتی تماس و پیام‌ها",
                        NotificationManager.IMPORTANCE_HIGH
                );
                nm.createNotificationChannel(ch);
            }
            Intent openIntent = new Intent(context, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(
                    context,
                    7003,
                    openIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            Notification notif = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title != null ? title : "روزهای من و زری")
                    .setContentText(body + " (برای صدای روان، اینترنت/فیلترشکن را بررسی کنید)")
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true)
                    .setContentIntent(pi)
                    .build();
            nm.notify(ALERT_NOTIF_ID, notif);
        } catch (Exception ignored) {
        }
    }

    private static String sha256Hex(String input) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (int i = 0; i < Math.min(16, digest.length); i++) {
            hex.append(String.format("%02x", digest[i]));
        }
        return hex.toString();
    }

    private void stopActivePlayer() {
        if (activePlayer != null) {
            try {
                if (activePlayer.isPlaying()) activePlayer.stop();
            } catch (Exception ignored) {
            }
            try {
                activePlayer.release();
            } catch (Exception ignored) {
            }
            activePlayer = null;
        }
    }

    @Override
    public void onDestroy() {
        cancelled = true;
        activeSessionId++;
        handler.removeCallbacksAndMessages(null);
        stopActivePlayer();
        abandonAudioFocus();
        releaseWakeLock();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
