package com.tullip.journal;

import static org.junit.Assert.*;
import static org.junit.Assume.*;

import android.app.Instrumentation;
import android.app.KeyguardManager;
import android.app.UiAutomation;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * No journal data is touched. Positive authentication requires the real Android credential UI.
 * The opt-in two-stage test MUST run only on the caller's disposable/read-only emulator.
 * Supply appLockStage=exercise|restart and the same ephemeral appLockTestPin to each stage,
 * with an explicit adb force-stop between stages. Never use a real person's device credential.
 */
@RunWith(AndroidJUnit4.class)
public class AppLockInstrumentedTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final UiAutomation automation = instrumentation.getUiAutomation();
    private final Context context = instrumentation.getTargetContext();

    @Test
    public void setupWithoutDeviceCredentialIsRejected() throws Exception {
        assumeFalse("A configured Android credential requires the opt-in flow test", deviceSecure());
        assumeFalse(context.getSharedPreferences("tullip_privacy", Context.MODE_PRIVATE)
            .getBoolean("device_credential_lock_enabled", false));
        MainActivity activity = startActivity();
        try {
            CountDownLatch completed = new CountDownLatch(1);
            AtomicReference<Boolean> result = new AtomicReference<>();
            AtomicReference<String> error = new AtomicReference<>();
            instrumentation.runOnMainSync(() -> activity.requestCredential("enable", (confirmed, message) -> {
                result.set(confirmed);
                error.set(message);
                completed.countDown();
            }));
            assertTrue(completed.await(10, TimeUnit.SECONDS));
            assertEquals(false, result.get());
            assertTrue(error.get().contains("Android Settings"));
            assertFalse(activity.lockStatus().getBoolean("enabled"));
            assertFalse(activity.lockStatus().getBoolean("locked"));
        } finally { instrumentation.runOnMainSync(activity::finish); }
    }

    @Test
    public void realDeviceCredentialFlowOnDisposableEmulator() throws Exception {
        Bundle arguments = InstrumentationRegistry.getArguments();
        String stage = arguments.getString("appLockStage", "");
        assumeTrue("Explicit opt-in is required for Android credential setup", "true".equals(arguments.getString("allowTemporaryDeviceCredential")));
        assumeTrue("Only disposable emulators may run this test", Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("goldfish"));
        assumeTrue("Choose exercise or restart stage", "exercise".equals(stage) || "restart".equals(stage));
        String pin = arguments.getString("appLockTestPin", "");
        assertTrue("Use an ephemeral numeric test credential", pin.matches("[0-9]{6,12}"));

        if ("exercise".equals(stage)) {
            assumeFalse("Preserve any pre-existing emulator credential", deviceSecure());
            assumeFalse("Preserve any pre-existing application lock", context.getSharedPreferences("tullip_privacy", Context.MODE_PRIVATE)
                .getBoolean("device_credential_lock_enabled", false));
            String setupResult = shell("locksettings set-pin " + pin);
            assertTrue("Android did not accept the disposable credential", setupResult.toLowerCase().contains("set"));
            assertTrue(deviceSecure());
            MainActivity activity = startActivity();
            try {
                Pending cancelledSetup = request(activity, "enable");
                waitForCredentialUi();
                shell("input keyevent 4");
                assertFalse(cancelledSetup.await());
                assertFalse(activity.lockStatus().getBoolean("enabled"));

                Pending setup = request(activity, "enable");
                enterCredential(pin);
                assertTrue("Actual Android credential confirmation did not enable app lock", setup.await());
                assertTrue(activity.lockStatus().getBoolean("enabled"));
                assertFalse(activity.lockStatus().getBoolean("locked"));
                assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0);

                instrumentation.runOnMainSync(activity::lockJournal);
                assertShielded(activity);
                Pending cancelledDisable = request(activity, "disable");
                waitForCredentialUi();
                shell("input keyevent 4");
                assertFalse(cancelledDisable.await());
                assertTrue(activity.lockStatus().getBoolean("enabled"));
                assertShielded(activity);

                Pending failed = request(activity, "unlock");
                String wrong = pin.charAt(0) == '9' ? "8" + pin.substring(1) : "9" + pin.substring(1);
                enterCredential(wrong);
                Thread.sleep(1500);
                assertEquals("Wrong credential must not resolve as authenticated", 1L, failed.done.getCount());
                assertShielded(activity);
                shell("input keyevent 4");
                assertFalse(failed.await());

                Pending unlock = request(activity, "unlock");
                enterCredential(pin);
                assertTrue(unlock.await());
                assertFalse(activity.lockStatus().getBoolean("locked"));
                shell("input keyevent " + KeyEvent.KEYCODE_HOME);
                Thread.sleep(500);
                assertShielded(activity);
                // Starting the existing singleTask activity must not reveal the WebView.
                instrumentation.runOnMainSync(() -> context.startActivity(new Intent(context, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)));
                Thread.sleep(500);
                assertShielded(activity);
            } finally { instrumentation.runOnMainSync(activity::finish); }
            // Intentionally retain only the temporary emulator credential and native enabled flag
            // so the caller can force-stop the process and prove persistence in the restart stage.
        } else {
            assertTrue("Exercise stage must have configured the disposable credential", deviceSecure());
            MainActivity activity = startActivity();
            try {
                assertTrue(activity.lockStatus().getBoolean("enabled"));
                assertShielded(activity);
                Pending unlock = request(activity, "unlock");
                enterCredential(pin);
                assertTrue(unlock.await());
                Pending disable = request(activity, "disable");
                enterCredential(pin);
                assertTrue(disable.await());
                assertFalse(activity.lockStatus().getBoolean("enabled"));
                assertFalse(activity.lockStatus().getBoolean("locked"));
                assertEquals(0, activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE);
            } finally { instrumentation.runOnMainSync(activity::finish); }
            String clearResult = shell("locksettings clear --old " + pin);
            assertTrue("Temporary credential cleanup failed", clearResult.toLowerCase().contains("clear"));
            assertFalse(deviceSecure());
            MainActivity reopened = startActivity();
            try { assertFalse(reopened.lockStatus().getBoolean("enabled")); }
            finally { instrumentation.runOnMainSync(reopened::finish); }
        }
    }

    private MainActivity startActivity() {
        Intent intent = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return (MainActivity) instrumentation.startActivitySync(intent);
    }

    private boolean deviceSecure() {
        return ((KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE)).isDeviceSecure();
    }

    private void assertShielded(MainActivity activity) {
        assertTrue(activity.lockStatus().optBoolean("locked"));
        instrumentation.runOnMainSync(() -> {
            assertEquals(View.INVISIBLE, activity.getBridge().getWebView().getVisibility());
            assertEquals(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS,
                activity.getBridge().getWebView().getImportantForAccessibility());
        });
    }

    private Pending request(MainActivity activity, String action) {
        Pending pending = new Pending();
        instrumentation.runOnMainSync(() -> activity.requestCredential(action, (confirmed, error) -> {
            pending.confirmed.set(confirmed);
            pending.error.set(error);
            pending.done.countDown();
        }));
        return pending;
    }

    private void enterCredential(String credential) throws Exception {
        waitForCredentialUi();
        // Numeric keyboard input goes only to the actual Android system credential activity.
        shell("input text " + credential);
        shell("input keyevent " + KeyEvent.KEYCODE_ENTER);
        AccessibilityNodeInfo root = automation.getRootInActiveWindow();
        if (root != null && ("com.android.settings".equals(String.valueOf(root.getPackageName()))
                || "com.android.systemui".equals(String.valueOf(root.getPackageName())))) clickCredentialConfirmation(root);
    }

    private void waitForCredentialUi() throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(25);
        while (System.nanoTime() < deadline) {
            AccessibilityNodeInfo root = automation.getRootInActiveWindow();
            if (root != null) {
                String owner = String.valueOf(root.getPackageName());
                if (("com.android.settings".equals(owner) || "com.android.systemui".equals(owner))
                        && hasCredentialInput(root)) return;
            }
            Thread.sleep(200);
        }
        fail("Android's system credential screen did not appear");
    }

    private boolean hasCredentialInput(AccessibilityNodeInfo node) {
        String id = String.valueOf(node.getViewIdResourceName()).toLowerCase();
        if (node.isVisibleToUser() && (node.isEditable() || node.isPassword()
                || id.contains("pin_entry") || id.contains("pinentry"))) return true;
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child != null && hasCredentialInput(child)) return true;
        }
        return false;
    }

    private boolean clickCredentialConfirmation(AccessibilityNodeInfo node) {
        String label = String.valueOf(node.getText()).trim();
        if (node.isVisibleToUser() && node.isClickable() && node.isEnabled()
                && ("Next".equalsIgnoreCase(label) || "Confirm".equalsIgnoreCase(label)
                || "Continue".equalsIgnoreCase(label) || "Unlock".equalsIgnoreCase(label))) {
            return node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        }
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child != null && clickCredentialConfirmation(child)) return true;
        }
        return false;
    }

    private String shell(String command) throws Exception {
        try (ParcelFileDescriptor descriptor = automation.executeShellCommand(command);
             FileInputStream input = new FileInputStream(descriptor.getFileDescriptor())) {
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static class Pending {
        final CountDownLatch done = new CountDownLatch(1);
        final AtomicReference<Boolean> confirmed = new AtomicReference<>();
        final AtomicReference<String> error = new AtomicReference<>();
        boolean await() throws Exception {
            assertTrue("Credential activity did not return", done.await(30, TimeUnit.SECONDS));
            assertNull(error.get());
            return Boolean.TRUE.equals(confirmed.get());
        }
    }
}
