package com.roozhaye.manozari;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import androidx.core.content.ContextCompat;

public class IncomingSmsReceiver extends BroadcastReceiver {
    private static long lastSmsAtMs = 0L;
    private static String lastSmsFingerprint = "";

    public static synchronized boolean shouldSkipDuplicateSms(String sender, String body) {
        long now = System.currentTimeMillis();
        String normSender = sender != null ? sender.trim().toLowerCase() : "";
        String normBody = body != null ? body.trim().replaceAll("\\s+", " ") : "";
        String fp = normSender + "::" + normBody;
        if (now - lastSmsAtMs < 6000L && fp.equals(lastSmsFingerprint)) {
            return true;
        }
        lastSmsAtMs = now;
        lastSmsFingerprint = fp;
        return false;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }

        SharedPreferences prefs = context.getSharedPreferences("rmz_native_prefs", Context.MODE_PRIVATE);
        if (!prefs.getBoolean("announce_sms_enabled", true)) {
            return;
        }

        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null || messages.length == 0) {
            return;
        }

        String originatingAddress = messages[0].getDisplayOriginatingAddress();
        StringBuilder fullBody = new StringBuilder();
        for (SmsMessage msg : messages) {
            if (msg != null && msg.getMessageBody() != null) {
                fullBody.append(msg.getMessageBody());
            }
        }

        String body = fullBody.toString().trim();
        if (body.length() > 240) {
            body = body.substring(0, 240);
        }

        String senderName = lookupContactName(context, originatingAddress);
        if (senderName == null || senderName.trim().isEmpty()) {
            senderName = (originatingAddress != null && !originatingAddress.trim().isEmpty())
                    ? originatingAddress.trim()
                    : "فرستنده ناشناس";
        }

        if (shouldSkipDuplicateSms(senderName, body)) {
            return;
        }

        boolean isMale = "male".equals(prefs.getString("default_voice_gender", "female"));
        String voiceName = prefs.getString("default_voice_name", isMale ? "Charon" : "Kore");
        String spoken = "پیامک جدید از طرف " + senderName + ". متن پیام: " + (body.isEmpty() ? "بدون متن" : body);

        CallAnnouncerService.announce(
                context.getApplicationContext(),
                "پیامک جدید: " + senderName,
                spoken,
                voiceName,
                isMale,
                1,
                false
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
