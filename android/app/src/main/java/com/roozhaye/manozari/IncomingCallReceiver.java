package com.roozhaye.manozari;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.ContactsContract;
import android.telephony.TelephonyManager;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

public class IncomingCallReceiver extends BroadcastReceiver {
    private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());
    private static Runnable pendingUnknownFallback = null;
    private static long lastHandledRingAtMs = 0L;
    private static String lastHandledNumber = "";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(intent.getAction())) {
            return;
        }

        String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state) || TelephonyManager.EXTRA_STATE_IDLE.equals(state)) {
            cancelPendingFallback();
            lastHandledRingAtMs = 0L;
            lastHandledNumber = "";
            CallAnnouncerService.stopActive(context);
            return;
        }

        if (!TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        if (!prefs.getBoolean("announce_calls_enabled", true)) {
            return;
        }

        final Context appCtx = context.getApplicationContext();
        final boolean hasNumberExtra = intent.hasExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
        final String incomingNumber = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);

        // Android 9+ sends two PHONE_STATE=RINGING broadcasts: the first often omits EXTRA_INCOMING_NUMBER,
        // and the second ~150-400ms later carries the actual number. Wait briefly before falling back to "تماس ناشناس".
        if (!hasNumberExtra) {
            long now = System.currentTimeMillis();
            if (now - lastHandledRingAtMs < 5000L) {
                return;
            }
            cancelPendingFallback();
            pendingUnknownFallback = () -> {
                pendingUnknownFallback = null;
                if (System.currentTimeMillis() - lastHandledRingAtMs < 5000L) {
                    return;
                }
                dispatchCallAnnouncement(appCtx, prefs, null);
            };
            MAIN_HANDLER.postDelayed(pendingUnknownFallback, 650L);
            return;
        }

        cancelPendingFallback();

        String normalizedNum = incomingNumber != null ? incomingNumber.trim() : "";
        long now = System.currentTimeMillis();
        if (now - lastHandledRingAtMs < 5000L && normalizedNum.equals(lastHandledNumber)) {
            return;
        }
        lastHandledRingAtMs = now;
        lastHandledNumber = normalizedNum;

        dispatchCallAnnouncement(appCtx, prefs, normalizedNum);
    }

    private static void cancelPendingFallback() {
        if (pendingUnknownFallback != null) {
            MAIN_HANDLER.removeCallbacks(pendingUnknownFallback);
            pendingUnknownFallback = null;
        }
    }

    private void dispatchCallAnnouncement(Context context, SharedPreferences prefs, String incomingNumber) {
        lastHandledRingAtMs = System.currentTimeMillis();

        String callerName = lookupContactName(context, incomingNumber);
        if (callerName == null || callerName.trim().isEmpty()) {
            callerName = (incomingNumber != null && !incomingNumber.trim().isEmpty())
                    ? incomingNumber.trim()
                    : "تماس ناشناس";
        }

        String displayOrPhonetic = FinglishPhoneticHelper.resolveSenderDisplayName(context, callerName);
        String spokenText = "تماس ورودی از طرف " + displayOrPhonetic;
        boolean isMale = "male".equals(prefs.getString("default_voice_gender", "female"));
        String voiceName = prefs.getString("default_voice_name", isMale ? "Charon" : "Kore");
        int repeat = 2;

        try {
            String jsonStr = prefs.getString("callers_json", "[]");
            JSONArray arr = new JSONArray(jsonStr);
            String normalizedTarget = callerName.trim().toLowerCase();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                String name = obj.optString("name", "").trim();
                String latinAlias = obj.optString("latinAlias", "").trim();
                String phonetic = obj.optString("persianPhonetic", "").trim();
                if ((!name.isEmpty() && name.equalsIgnoreCase(normalizedTarget))
                        || (!latinAlias.isEmpty() && latinAlias.equalsIgnoreCase(normalizedTarget))) {
                    String template = obj.optString("template", "تماس ورودی از طرف {name}");
                    String nameForSpeech = !phonetic.isEmpty() ? phonetic : name;
                    spokenText = template.replace("{name}", nameForSpeech);
                    isMale = "male".equals(obj.optString("voiceGender", "female"));
                    String customVoice = obj.optString("voiceName", "").trim();
                    if (!customVoice.isEmpty()) {
                        voiceName = customVoice;
                    } else {
                        voiceName = isMale ? "Charon" : "Kore";
                    }
                    repeat = obj.optInt("repeatCount", 2);
                    break;
                }
            }
        } catch (Exception ignored) {
        }

        CallAnnouncerService.announce(
                context,
                "تماس ورودی: " + callerName,
                spokenText,
                voiceName,
                isMale,
                repeat,
                true
        );
    }

    private String lookupContactName(Context context, String phoneNumber) {
        if (phoneNumber == null || phoneNumber.trim().isEmpty()) return null;
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            return null;
        }
        Uri uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(phoneNumber));
        try (Cursor cursor = context.getContentResolver().query(
                uri,
                new String[]{ContactsContract.PhoneLookup.DISPLAY_NAME},
                null,
                null,
                null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                return cursor.getString(0);
            }
        } catch (Exception ignored) {
        }
        return null;
    }
}
