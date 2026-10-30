package com.tullip.journal;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.provider.Settings;
import java.security.GeneralSecurityException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** App-private preferences are excluded from Android backup and journal JSON exports. */
final class AppPinStore {
    static final String PREFERENCES = "tullip_privacy";
    static final String LEGACY_ENABLED = "device_credential_lock_enabled";
    private static final String ENABLED = "app_pin_enabled";
    private final Context context;
    private final SharedPreferences preferences;

    AppPinStore(Context context) {
        this.context = context.getApplicationContext();
        preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }
    boolean enabled() { return preferences.getBoolean(ENABLED, false) || legacy(); }
    boolean legacy() { return preferences.getBoolean(LEGACY_ENABLED, false); }
    int boot() { return Settings.Global.getInt(context.getContentResolver(), Settings.Global.BOOT_COUNT, -1); }

    synchronized long remainingMillis() {
        return PinThrottle.remaining(System.currentTimeMillis(), SystemClock.elapsedRealtime(), boot(),
            preferences.getLong("pin_wall_deadline", 0), preferences.getLong("pin_elapsed_deadline", 0),
            preferences.getInt("pin_boot", -1));
    }

    synchronized void configure(byte[] salt, byte[] verifier) {
        if (salt.length != PinCrypto.SALT_BYTES || verifier.length != 32) throw new IllegalArgumentException("Invalid verifier");
        SharedPreferences.Editor editor = clearAttempts(preferences.edit()).putBoolean(ENABLED, true)
            .putBoolean(LEGACY_ENABLED, false).putInt("pin_version", 1)
            .putInt("pin_iterations", PinCrypto.ITERATIONS)
            .putString("pin_salt", PinCrypto.hex(salt)).putString("pin_verifier", PinCrypto.hex(verifier));
        boolean committed = commitOrRollback(editor);
        if (!committed) throw new IllegalStateException("Could not save your app PIN. Your journal stays protected.");
    }

    boolean verify(char[] pin) throws GeneralSecurityException {
        final String saltHex;
        final String verifierHex;
        final byte[] salt;
        final byte[] expected;
        synchronized (this) {
            if (!enabled() || legacy()) throw new IllegalStateException("Finish the protected lock upgrade first.");
            if (remainingMillis() > 0) return false;
            if (!PinCrypto.validPin(pin)) throw new IllegalArgumentException("Enter all six PIN digits.");
            if (preferences.getInt("pin_version", 0) != 1
                || preferences.getInt("pin_iterations", 0) != PinCrypto.ITERATIONS) {
                throw new IllegalStateException("PIN protection could not be read. Your journal remains locked.");
            }
            saltHex = preferences.getString("pin_salt", null);
            verifierHex = preferences.getString("pin_verifier", null);
            salt = PinCrypto.unhex(saltHex, PinCrypto.SALT_BYTES);
            expected = PinCrypto.unhex(verifierHex, 32);
        }
        byte[] actual = null;
        try {
            // Never hold the store monitor across the KDF: onPause/status must be
            // able to cover the WebView immediately while verification is running.
            actual = PinCrypto.derive(pin, salt, PinCrypto.ITERATIONS);
            boolean accepted = PinCrypto.matches(expected, actual);
            synchronized (this) {
                if (!enabled() || legacy() || !saltHex.equals(preferences.getString("pin_salt", null))
                    || !verifierHex.equals(preferences.getString("pin_verifier", null))) {
                    throw new IllegalStateException("PIN protection changed. Try again.");
                }
                if (remainingMillis() > 0) return false;
                SharedPreferences.Editor editor = preferences.edit();
                if (accepted) clearAttempts(editor);
                else {
                    int count = Math.min(100, preferences.getInt("pin_failures", 0) + 1);
                    long delay = PinThrottle.delayMillis(count);
                    editor.putInt("pin_failures", count).putLong("pin_wall_deadline", System.currentTimeMillis() + delay)
                        .putLong("pin_elapsed_deadline", SystemClock.elapsedRealtime() + delay).putInt("pin_boot", boot());
                }
                if (!commitOrRollback(editor)) throw new IllegalStateException("Could not save lock protection. Try again.");
                return accepted;
            }
        } finally {
            Arrays.fill(salt, (byte) 0);
            Arrays.fill(expected, (byte) 0);
            if (actual != null) Arrays.fill(actual, (byte) 0);
        }
    }
    synchronized void disable() {
        SharedPreferences.Editor editor = clearAttempts(preferences.edit());
        editor.putBoolean(ENABLED, false).putBoolean(LEGACY_ENABLED, false)
            .remove("pin_version").remove("pin_iterations").remove("pin_salt").remove("pin_verifier");
        if (!commitOrRollback(editor)) throw new IllegalStateException("Could not disable app lock. It remains enabled.");
    }

    /** commit(false) still mutates SharedPreferences memory. Restore the complete
     * prior privacy snapshot before any caller rechecks enabled/legacy state. */
    private boolean commitOrRollback(SharedPreferences.Editor editor) {
        Map<String, ?> previous = preferences.getAll();
        if (editor.commit()) return true;
        SharedPreferences.Editor restore = preferences.edit().clear();
        for (Map.Entry<String, ?> entry : previous.entrySet()) {
            String key = entry.getKey(); Object value = entry.getValue();
            if (value instanceof Boolean) restore.putBoolean(key, (Boolean) value);
            else if (value instanceof Integer) restore.putInt(key, (Integer) value);
            else if (value instanceof Long) restore.putLong(key, (Long) value);
            else if (value instanceof Float) restore.putFloat(key, (Float) value);
            else if (value instanceof String) restore.putString(key, (String) value);
            else if (value instanceof Set<?>) {
                Set<String> strings = new HashSet<>();
                for (Object item : (Set<?>) value) strings.add((String) item);
                restore.putStringSet(key, strings);
            }
        }
        // Even if storage is still unavailable, this synchronously restores the
        // in-memory flags/verifier, so a failed disable cannot reveal the journal.
        restore.commit();
        return false;
    }

    private SharedPreferences.Editor clearAttempts(SharedPreferences.Editor editor) {
        return editor.remove("pin_failures").remove("pin_wall_deadline").remove("pin_elapsed_deadline").remove("pin_boot");
    }
}


