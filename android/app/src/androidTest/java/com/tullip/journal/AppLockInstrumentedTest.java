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
 * Opt-in real TULLIP keypad test, only on a caller-owned disposable/read-only emulator.
 * Does not configure or remove the phone's screen credential and never touches journal data.
 * Run exercise, adb force-stop the app, then restart with the SAME ephemeral six-digit
 * appLockTestPin; allowTemporaryAppPin=true explicitly authorizes this disposable lock.
 */
@RunWith(AndroidJUnit4.class)
public class AppLockInstrumentedTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private final UiAutomation automation = instrumentation.getUiAutomation();
    private final Context context = instrumentation.getTargetContext();

    @Test
    public void customPinFlowOnDisposableEmulator() throws Exception {
        Bundle arguments = InstrumentationRegistry.getArguments();
        String stage = arguments.getString("appLockStage", "");
        assumeTrue("Explicit opt-in required", "true".equals(arguments.getString("allowTemporaryAppPin")));
        assumeTrue("Disposable emulator only", Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("goldfish"));
        assumeTrue("Choose exercise or restart stage", "exercise".equals(stage) || "restart".equals(stage));
        String pin = arguments.getString("appLockTestPin", "");
        assertTrue("Use an ephemeral six-digit test PIN", pin.matches("[0-9]{6}"));
        String wrong = (pin.charAt(0) == '9' ? "8" : "9") + pin.substring(1);
        AppPinStore store = new AppPinStore(context);

        if ("exercise".equals(stage)) {
            assumeFalse("Preserve pre-existing protection", store.enabled());
            assertFalse("This proves no phone credential is required", ((KeyguardManager)
                context.getSystemService(Context.KEYGUARD_SERVICE)).isDeviceSecure());
            MainActivity activity = startActivity();
            try {
                Pending cancelledSetup = request(activity, "enable");
                click("Cancel");
                assertFalse(cancelledSetup.await());
                assertFalse(store.enabled());

                Pending setup = request(activity, "enable");
                enterPin(pin); click("Continue");
                waitForText("Confirm your new");
                enterPin(wrong); click("Save TULLIP PIN");
                waitForText("do not match");
                assertFalse(store.enabled());
                enterPin(pin); click("Save TULLIP PIN");
                assertTrue(setup.await());
                assertTrue(store.enabled());
                assertFalse(store.legacy());
                assertEquals("app_pin", activity.lockStatus().getString("method"));
                assertFalse(activity.lockStatus().optBoolean("locked"));
                assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0);
                String preferences = context.getSharedPreferences(AppPinStore.PREFERENCES, Context.MODE_PRIVATE).getAll().toString();
                assertFalse("Raw PIN must never be persisted", preferences.contains(pin));

                instrumentation.runOnMainSync(activity::lockJournal);
                assertShielded(activity);
                Pending cancelledDisable = request(activity, "disable");
                click("Cancel");
                assertFalse(cancelledDisable.await());
                assertTrue(store.enabled());
                assertShielded(activity);

                Pending rejected = request(activity, "unlock");
                enterPin(wrong); click("Unlock");
                waitForText("does not match");
                assertEquals(1L, rejected.done.getCount());
                assertShielded(activity);
                click("Cancel"); assertFalse(rejected.await());

                Pending unlock = request(activity, "unlock");
                enterPin(pin); click("Unlock");
                assertTrue(unlock.await());
                shell("input keyevent " + KeyEvent.KEYCODE_HOME);
                Thread.sleep(600);
                assertShielded(activity);
                instrumentation.runOnMainSync(() -> context.startActivity(new Intent(context, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)));
                Thread.sleep(600);
                assertShielded(activity);

                Pending throttled = request(activity, "unlock");
                for (int attempt = 0; attempt < 5; attempt++) {
                    enterPin(wrong); click("Unlock");
                    waitForText(attempt == 4 ? "Too many attempts" : "does not match");
                }
                assertTrue(store.remainingMillis() > 0);
                enterPin(pin); click("Unlock");
                waitForText("Too many attempts");
                assertEquals("Cooldown must not accept even a correct PIN", 1L, throttled.done.getCount());
                assertShielded(activity);
                click("Cancel"); assertFalse(throttled.await());
                assertEquals(5, context.getSharedPreferences(AppPinStore.PREFERENCES, Context.MODE_PRIVATE).getInt("pin_failures", 0));
            } finally { instrumentation.runOnMainSync(activity::finish); }
            // Retain only this synthetic app PIN so the caller can prove process restart protection.
        } else {
            assertTrue("Exercise must have enabled the app PIN", store.enabled());
            assertFalse(store.legacy());
            assertEquals("Failed attempts survive process restart", 5,
                context.getSharedPreferences(AppPinStore.PREFERENCES, Context.MODE_PRIVATE).getInt("pin_failures", 0));
            MainActivity activity = startActivity();
            try {
                assertShielded(activity);
                Pending unlock = request(activity, "unlock");
                long cooldown = store.remainingMillis();
                if (cooldown > 0) {
                    enterPin(pin); click("Unlock"); waitForText("Too many attempts");
                    assertShielded(activity);
                    Thread.sleep(Math.min(31_000, cooldown + 1000));
                }
                enterPin(pin); click("Unlock");
                assertTrue(unlock.await());
                assertFalse(activity.lockStatus().optBoolean("locked"));
                assertEquals(0, store.remainingMillis());

                Pending change = request(activity, "change");
                enterPin(pin); click("Continue"); waitForText("Create a six-digit");
                enterPin(wrong); click("Continue"); waitForText("Confirm your new");
                enterPin(wrong); click("Save TULLIP PIN"); assertTrue(change.await());
                instrumentation.runOnMainSync(activity::lockJournal);
                Pending oldRejected = request(activity, "unlock");
                enterPin(pin); click("Unlock"); waitForText("does not match");
                assertShielded(activity); click("Cancel"); assertFalse(oldRejected.await());
                Pending newUnlock = request(activity, "unlock");
                enterPin(wrong); click("Unlock"); assertTrue(newUnlock.await());
                Pending disable = request(activity, "disable");
                enterPin(wrong); click("Disable lock"); assertTrue(disable.await());
                assertFalse(store.enabled());
                assertFalse(activity.lockStatus().optBoolean("locked"));
                assertEquals(0, activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE);
            } finally { instrumentation.runOnMainSync(activity::finish); }
            MainActivity reopened = startActivity();
            try { assertFalse(reopened.lockStatus().optBoolean("enabled")); }
            finally { instrumentation.runOnMainSync(reopened::finish); }
        }
    }

    private MainActivity startActivity() {
        return (MainActivity) instrumentation.startActivitySync(new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
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
            pending.confirmed.set(confirmed); pending.error.set(error); pending.done.countDown();
        }));
        return pending;
    }
    private void enterPin(String pin) throws Exception {
        clickDescription("Clear PIN");
        for (char digit : pin.toCharArray()) clickDescription("PIN digit " + digit);
    }
    private void click(String text) throws Exception { waitForNode(text, false).performAction(AccessibilityNodeInfo.ACTION_CLICK); }
    private void clickDescription(String text) throws Exception { waitForNode(text, true).performAction(AccessibilityNodeInfo.ACTION_CLICK); }
    private AccessibilityNodeInfo waitForNode(String text, boolean description) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(35);
        while (System.nanoTime() < deadline) {
            AccessibilityNodeInfo found = find(automation.getRootInActiveWindow(), text, description, true);
            if (found != null && found.isEnabled()) return found;
            Thread.sleep(100);
        }
        throw new AssertionError("TULLIP native PIN control did not appear: " + text);
    }
    private void waitForText(String text) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(45);
        while (System.nanoTime() < deadline) {
            if (find(automation.getRootInActiveWindow(), text, false, false) != null) return;
            Thread.sleep(100);
        }
        throw new AssertionError("TULLIP native PIN status did not appear: " + text);
    }
    private AccessibilityNodeInfo find(AccessibilityNodeInfo node, String text, boolean description, boolean exact) {
        if (node == null) return null;
        String value = String.valueOf(description ? node.getContentDescription() : node.getText());
        if (node.isVisibleToUser() && (exact ? text.equals(value) : value.contains(text))) return node;
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo found = find(node.getChild(index), text, description, exact);
            if (found != null) return found;
        }
        return null;
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
            assertTrue("Native PIN dialog did not finish", done.await(60, TimeUnit.SECONDS));
            assertNull(error.get());
            return Boolean.TRUE.equals(confirmed.get());
        }
    }
}
