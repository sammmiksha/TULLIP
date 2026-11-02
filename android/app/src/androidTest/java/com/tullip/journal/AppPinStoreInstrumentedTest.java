package com.tullip.journal;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.Arrays;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Uses only an isolated test preference file; never alters a user's lock or journal. */
@RunWith(AndroidJUnit4.class)
public class AppPinStoreInstrumentedTest {
    private Context isolatedContext() {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        return new ContextWrapper(target) {
            @Override public SharedPreferences getSharedPreferences(String name, int mode) {
                return super.getSharedPreferences("tullip_pin_instrumentation_only", mode);
            }
        };
    }
    @Test public void verifierAndThrottlePersistAndNeverStoreRawPin() throws Exception {
        Context isolated = isolatedContext();
        SharedPreferences preferences = isolated.getSharedPreferences("unused", Context.MODE_PRIVATE);
        assertTrue(preferences.edit().clear().commit());
        char[] pin = "3141".toCharArray();
        byte[] salt = PinCrypto.randomSalt();
        byte[] verifier = PinCrypto.derive(pin, salt, PinCrypto.ITERATIONS);
        try {
            AppPinStore store = new AppPinStore(isolated);
            assertFalse(store.enabled());
            store.configure(salt, verifier);
            assertTrue(new AppPinStore(isolated).enabled());
            assertFalse(preferences.getAll().toString().contains(new String(pin)));
            assertTrue(store.verify(pin));
            for (int attempt = 0; attempt < 5; attempt++) assertFalse(store.verify("2718".toCharArray()));
            AppPinStore reopened = new AppPinStore(isolated);
            assertTrue(reopened.remainingMillis() > 0);
            assertFalse("Even a correct PIN cannot skip a persisted cooldown", reopened.verify(pin));
            assertEquals(5, preferences.getInt("pin_failures", 0));
            assertTrue(reopened.enabled());
        } finally {
            Arrays.fill(pin, '\0'); Arrays.fill(salt, (byte) 0); Arrays.fill(verifier, (byte) 0);
            assertTrue(preferences.edit().clear().commit());
        }
    }
    @Test public void legacyProtectionIsNeverSilentlyRemovedAndCorruptVerifierFailsClosed() throws Exception {
        Context isolated = isolatedContext();
        SharedPreferences preferences = isolated.getSharedPreferences("unused", Context.MODE_PRIVATE);
        assertTrue(preferences.edit().clear().putBoolean(AppPinStore.LEGACY_ENABLED, true).commit());
        try {
            AppPinStore store = new AppPinStore(isolated);
            assertTrue(store.enabled()); assertTrue(store.legacy());
            assertThrows(IllegalStateException.class, () -> store.verify("3141".toCharArray()));
            assertTrue(store.enabled());
            byte[] salt = PinCrypto.randomSalt();
            byte[] verifier = PinCrypto.derive("3141".toCharArray(), salt, PinCrypto.ITERATIONS);
            store.configure(salt, verifier);
            assertFalse(store.legacy()); assertTrue(store.enabled());
            assertTrue(preferences.edit().remove("pin_verifier").commit());
            assertThrows(IllegalArgumentException.class, () -> store.verify("3141".toCharArray()));
            assertTrue(new AppPinStore(isolated).enabled());
            Arrays.fill(salt, (byte) 0); Arrays.fill(verifier, (byte) 0);
        } finally { assertTrue(preferences.edit().clear().commit()); }
    }

    @Test public void existingSixDigitPinsRemainUsableUntilTheirOwnerChangesToFourDigits() throws Exception {
        Context isolated = isolatedContext();
        SharedPreferences preferences = isolated.getSharedPreferences("unused", Context.MODE_PRIVATE);
        assertTrue(preferences.edit().clear().commit());
        byte[] oldSalt = PinCrypto.randomSalt();
        byte[] oldVerifier = PinCrypto.derive("314159".toCharArray(), oldSalt, PinCrypto.ITERATIONS);
        byte[] newSalt = PinCrypto.randomSalt();
        byte[] newVerifier = PinCrypto.derive("3141".toCharArray(), newSalt, PinCrypto.ITERATIONS);
        try {
            assertTrue(preferences.edit().putBoolean("app_pin_enabled", true)
                .putInt("pin_version", PinCrypto.LEGACY_VERSION).putInt("pin_iterations", PinCrypto.ITERATIONS)
                .putString("pin_salt", PinCrypto.hex(oldSalt)).putString("pin_verifier", PinCrypto.hex(oldVerifier)).commit());
            AppPinStore store = new AppPinStore(isolated);
            assertEquals(PinCrypto.LEGACY_DIGITS, store.pinDigits());
            assertTrue(store.verify("314159".toCharArray()));
            store.configure(newSalt, newVerifier);
            assertEquals(PinCrypto.APP_PIN_DIGITS, store.pinDigits());
            assertTrue(store.verify("3141".toCharArray()));
        } finally {
            Arrays.fill(oldSalt, (byte) 0); Arrays.fill(oldVerifier, (byte) 0);
            Arrays.fill(newSalt, (byte) 0); Arrays.fill(newVerifier, (byte) 0);
            assertTrue(preferences.edit().clear().commit());
        }
    }
}
