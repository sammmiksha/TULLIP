package com.getcapacitor.myapp;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.tullip.journal.MainActivity;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * TULLIP launch smoke tests, executed against the installed Android app.
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {

    @Test
    public void usesTullipPackageAndDisablesSystemBackup() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();

        assertEquals("com.tullip.journal", appContext.getPackageName());
        assertEquals(0, appContext.getApplicationInfo().flags & ApplicationInfo.FLAG_ALLOW_BACKUP);
    }

    @Test
    public void launchesDashboardWithNativeSqlite() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Context context = instrumentation.getTargetContext();
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(intent);

        try {
            boolean ready = false;
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(60);
            while (!ready && System.nanoTime() < deadline) {
                CountDownLatch evaluated = new CountDownLatch(1);
                AtomicReference<String> result = new AtomicReference<>();
                instrumentation.runOnMainSync(() -> {
                    if (activity.getBridge() == null) {
                        evaluated.countDown();
                        return;
                    }
                    activity.getBridge().getWebView().evaluateJavascript(
                        "Boolean(document.querySelector('.bottom-nav') && document.body.innerText.includes('Available balance'))",
                        value -> { result.set(value); evaluated.countDown(); }
                    );
                });
                evaluated.await(2, TimeUnit.SECONDS);
                ready = "true".equals(result.get());
                if (!ready) Thread.sleep(500);
            }

            assertTrue("The local journal dashboard did not finish loading", ready);
            assertTrue(
                "The native TULLIP SQLite database was not created",
                Arrays.stream(context.databaseList()).anyMatch(name -> name.startsWith("tullip") && name.endsWith(".db"))
            );
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }
}
