package com.tullip.journal;

import static org.junit.Assert.*;
import static org.junit.Assume.*;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Opt-in actual WebView UI flow on a disposable emulator, with exact QA-only SQLite assertions.
 * Run masterStage=create, force-stop com.tullip.journal, then masterStage=verify with the same
 * fresh masterMarker=TULLIP_QA_... . No direct database writes, fake repositories or sample rows.
 */
@RunWith(AndroidJUnit4.class)
public class MasterFlowInstrumentedTest {
    private static final long STARTUP_SECONDS = 120;
    private static final long UI_SECONDS = 45;
    private Instrumentation instrumentation;
    private Context context;
    private MainActivity activity;
    private Handler mainHandler;
    private SharedPreferences baseline;
    private String marker;

    @Test
    public void onboardingSavingsAndRestartThroughRealUi() throws Exception {
        Bundle arguments = InstrumentationRegistry.getArguments();
        String stage = arguments.getString("masterStage", "");
        marker = arguments.getString("masterMarker", "");
        assumeTrue("Explicit QA marker and stage required", !stage.isEmpty() && !marker.isEmpty());
        assertTrue("Use create or verify stage", "create".equals(stage) || "verify".equals(stage));
        assertTrue("Use a fresh, bounded, non-personal QA marker", marker.matches("TULLIP_QA_[A-Za-z0-9_-]{1,32}"));
        assumeTrue("Only disposable emulators may run this flow", Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("goldfish"));
        instrumentation = InstrumentationRegistry.getInstrumentation();
        context = instrumentation.getTargetContext();
        mainHandler = new Handler(Looper.getMainLooper());
        baseline = context.getSharedPreferences("master_flow_" + marker, Context.MODE_PRIVATE);
        activity = (MainActivity) instrumentation.startActivitySync(
            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            waitForJs("Boolean(document.querySelector('.bottom-nav') || document.querySelector('#onboarding-heading'))",
                STARTUP_SECONDS, "The local journal or onboarding did not load");
            if ("create".equals(stage)) {
                completeOnboardingIfShown();
                createScenario();
            } else {
                assertFalse("Existing users must not repeat first-launch onboarding", truth("Boolean(document.querySelector('#onboarding-heading'))"));
                verifyPersistedScenario();
            }
        } finally { mainHandler.post(activity::finish); }
    }

    private void completeOnboardingIfShown() throws Exception {
        if (truth("Boolean(document.querySelector('#onboarding-heading'))")) {
            click("document.querySelector('.introduction-actions .primary-button')");
            waitForJs("Boolean(document.querySelector('#onboarding-name'))", UI_SECONDS, "Onboarding name step did not open");
            setInput("#onboarding-name", "  QA Tulip 🌷  ");
            click("document.querySelector('.introduction-actions .primary-button')");
            waitForJs("Boolean(document.querySelector('.introduction-preferences'))", UI_SECONDS, "Onboarding preferences did not open");
            assertEquals("INR", jsString("document.querySelector('.introduction-preferences select').value"));
            click("document.querySelector('.introduction-actions .primary-button')");
            waitForJs("Boolean(document.querySelector('.introduction-feature-list'))", UI_SECONDS, "Onboarding introduction did not open");
            click("document.querySelector('.introduction-actions .primary-button')");
            waitForJs("Boolean(document.querySelector('.bottom-nav'))", UI_SECONDS, "Starting the journal did not open navigation");
            baseline.edit().putBoolean("personalizedOnboarding", true).commit();
            waitForJs("Boolean(document.querySelector('.walkthrough-card'))", UI_SECONDS, "The first guided tour did not open");
            click(button(".walkthrough-card", "Skip tour"));
            waitForJs("!document.querySelector('.walkthrough-card')", UI_SECONDS, "The guided tour could not be skipped");
            assertTrue(truth("document.querySelector('.hero h1').textContent.includes('QA Tulip 🌷')"));
        }
        waitForJs("Boolean(document.querySelector('.bottom-nav'))", UI_SECONDS, "Journal navigation was unavailable");
        if (truth("Boolean(document.querySelector('.walkthrough-card'))")) {
            click(button(".walkthrough-card", "Skip tour"));
            waitForJs("!document.querySelector('.walkthrough-card')", UI_SECONDS, "A prior guided tour did not close");
        }
    }

    private void createScenario() throws Exception {
        assertNull("Use a fresh QA marker; never duplicate a prior run", findRecord("transactions", "description", marker + "_SALARY"));
        assertEquals("Use an isolated INR test journal", "INR", findRecord("settings", "id", "app").getString("currency"));
        openScreen("Home");
        assertTrue("Baseline is recorded once per fresh QA run", !baseline.contains("available"));
        baseline.edit().putLong("available", money(".balance-card strong"))
            .putLong("income", money(".metric.income strong"))
            .putLong("expenses", money(".metric.expense strong"))
            .putLong("reserved", money(".allocation-summary span b"))
            .commit();

        click("document.querySelector('button[aria-label=\"Add transaction\"]')");
        waitForJs("Boolean(document.querySelector('#transaction-title'))", UI_SECONDS, "Income form did not open");
        click("Array.from(document.querySelectorAll('.type-toggle button')).find(button => button.textContent.includes('Income'))");
        waitForJs("document.querySelector('#transaction-title').textContent.includes('win')", UI_SECONDS, "Income form did not initialize");
        setInput(".modal .amount-field input", "20000");
        setSelect(".modal > form > label select", "account-bank");
        setSelect(".modal .form-two label:first-child select", "inc-salary");
        setSelect(".modal .form-two label:last-child select", "upi");
        setInput(".modal input[placeholder=\"What was this for?\"]", marker + "_SALARY");
        String day = jsString("document.querySelector('.modal input[type=\"date\"]').value");
        baseline.edit().putString("date", day).commit();
        saveModal();
        JSONObject salary = waitForRecord("transactions", "description", marker + "_SALARY");
        assertEquals(2000000, salary.getLong("amountMinor"));
        assertEquals("income", salary.getString("type"));
        assertEquals("account-bank", salary.getString("accountId"));
        assertEquals("upi", salary.getString("paymentMethodId"));
        assertHome(2000000, 0);

        openScreen("Goals");
        createGoal(marker + "_PHONE", "40000");
        createGoal(marker + "_SOFA", "50000");
        assertJar(marker + "_PHONE", 0, 4000000);
        assertJar(marker + "_SOFA", 0, 5000000);
        savings(marker + "_PHONE", "allocation", "1000", marker + "_PHONE_ADD");
        assertJar(marker + "_PHONE", 100000, 4000000);
        savings(marker + "_SOFA", "allocation", "5000", marker + "_SOFA_ADD");
        assertJar(marker + "_SOFA", 500000, 5000000);
        assertHome(1400000, 600000);

        openScreen("Goals");
        savings(marker + "_PHONE", "withdrawal", "400", marker + "_PHONE_PART");
        assertJar(marker + "_PHONE", 60000, 4000000);
        assertHome(1440000, 560000);
        openScreen("Goals");
        savings(marker + "_PHONE", "withdrawal", "600", marker + "_PHONE_FULL");
        assertJar(marker + "_PHONE", 0, 4000000);
        assertJar(marker + "_SOFA", 500000, 5000000);
        assertHome(1500000, 500000);
        verifyQaRows();
        verifyIntroductionAndWalkthroughReplay();
    }

    private void verifyPersistedScenario() throws Exception {
        assertTrue("Create stage baseline must survive the process restart", baseline.contains("available"));
        verifyQaRows();
        assertHome(1500000, 500000);
        if (baseline.getBoolean("personalizedOnboarding", false)) {
            assertTrue(truth("document.querySelector('.hero h1').textContent.includes('QA Tulip 🌷')"));
            JSONObject settings = findRecord("settings", "id", "app");
            assertEquals("QA Tulip 🌷", settings.getString("displayName"));
            assertTrue(settings.getBoolean("onboardingCompleted"));
        }
        openScreen("Goals");
        assertJar(marker + "_PHONE", 0, 4000000);
        assertJar(marker + "_SOFA", 500000, 5000000);
        click(goalButton(marker + "_PHONE", "View savings history"));
        waitForJs(goal(marker + "_PHONE") + ".querySelectorAll('.history-entry').length === 3", UI_SECONDS, "Both release history entries and original allocation must persist");
        assertTrue(truth(goal(marker + "_PHONE") + ".textContent.includes('Released')"));
        openScreen("Journal");
        setInput("input[data-tour=\"journal-search\"]", marker + "_SALARY");
        waitForJs("Array.from(document.querySelectorAll('.journal-list .transaction-copy b')).some(item => item.textContent === " + quote(marker + "_SALARY") + ")", UI_SECONDS, "Salary was not searchable after restart");

        String day = baseline.getString("date", "");
        openScreen("Calendar");
        navigateMonth(day);
        String dayButton = "Array.from(document.querySelectorAll('.calendar-grid button:not(.outside)')).find(button => Number(button.querySelector('b').textContent) === " + Integer.parseInt(day.substring(8, 10)) + ")";
        waitForJs("Boolean(" + dayButton + " && " + dayButton + ".querySelector('em.income'))", UI_SECONDS, "Calendar income marker did not survive restart");
        click(dayButton);
        waitForJs("Array.from(document.querySelectorAll('.transaction-list .transaction-copy b')).some(item => item.textContent === " + quote(marker + "_SALARY") + ")", UI_SECONDS, "Calendar day panel did not show salary");
        assertTrue("Calendar has at most one marker per financial type", truth("Array.from(document.querySelectorAll('.calendar-grid button')).every(button => button.querySelectorAll('em.income').length <= 1 && button.querySelectorAll('em.expense').length <= 1)"));

        openScreen("Reports");
        navigateMonth(day);
        assertEquals(baseline.getLong("income", 0) + 2000000, money(".metric.income strong"));
        assertEquals(baseline.getLong("expenses", 0), money(".metric.expense strong"));
        assertEquals(baseline.getLong("income", 0) + 2000000 - baseline.getLong("expenses", 0), money(".report-hero strong"));
        assertTrue("Both export actions remain available", truth("Boolean(Array.from(document.querySelectorAll('[data-tour=\"reports-export\"] button')).find(button => button.textContent.trim() === 'CSV') && Array.from(document.querySelectorAll('[data-tour=\"reports-export\"] button')).find(button => button.textContent.includes('PDF')))"));
        openScreen("Settings");
        waitForJs("Boolean(document.querySelector('.privacy-lock-settings') && document.querySelector('.accounts-panel') && document.querySelector('.data-card'))", UI_SECONDS, "Settings core privacy/accounts/backup sections did not load");
        JSONObject settings = findRecord("settings", "id", "app");
        assertTrue("Completed/replayed tour must remain complete after restart", settings.getBoolean("walkthroughCompleted"));
    }

    private void verifyIntroductionAndWalkthroughReplay() throws Exception {
        openScreen("Settings");
        click(button(".content", "Replay introduction"));
        waitForJs("Boolean(document.querySelector('.introduction-feature-list'))", UI_SECONDS, "Replay introduction did not open");
        assertFalse("Replay must not force existing users to re-enter a name", truth("Boolean(document.querySelector('#onboarding-name'))"));
        click(button(".introduction-actions", "Back to My Journal"));
        waitForJs("Boolean(document.querySelector('.bottom-nav'))", UI_SECONDS, "Introduction replay did not return to journal");
        if (truth("Boolean(document.querySelector('.walkthrough-card'))")) {
            click(button(".walkthrough-card", "Skip tour"));
            waitForJs("!document.querySelector('.walkthrough-card')", UI_SECONDS, "Tour did not close");
        }
        openScreen("Settings");
        click(button(".content", "Replay walkthrough"));
        waitForJs("Boolean(document.querySelector('.walkthrough-card'))", UI_SECONDS, "Walkthrough replay did not open");
        String firstTitle = jsString("document.querySelector('#walkthrough-title').textContent");
        click("document.querySelector('.walkthrough-card .primary-button')");
        waitForJs("document.querySelector('#walkthrough-title').textContent !== " + quote(firstTitle), UI_SECONDS, "Tour Next did not advance");
        click("document.querySelector('.walkthrough-card .secondary-button')");
        waitForJs("document.querySelector('#walkthrough-title').textContent === " + quote(firstTitle), UI_SECONDS, "Tour Back did not restore the first step");
        int remaining = 12;
        while (truth("Boolean(document.querySelector('.walkthrough-card'))") && remaining-- > 0) {
            String title = jsString("document.querySelector('#walkthrough-title').textContent");
            click("document.querySelector('.walkthrough-card .primary-button')");
            waitForJs("!document.querySelector('.walkthrough-card') || document.querySelector('#walkthrough-title').textContent !== " + quote(title), UI_SECONDS, "Tour did not advance or finish");
        }
        assertFalse("Tour must finish without blocking the app", truth("Boolean(document.querySelector('.walkthrough-card'))"));
    }

    private void createGoal(String name, String target) throws Exception {
        click("document.querySelector('[data-tour=\"jar-create\"]')");
        waitForJs("Boolean(document.querySelector('.form-card'))", UI_SECONDS, "New wish form did not open");
        setInput(".form-card label:first-child input", name);
        setInput(".form-card label:nth-child(2) input", target);
        click("document.querySelector('.form-card .primary-button')");
        waitForJs("!document.querySelector('.form-card') && Boolean(" + goal(name) + ")", UI_SECONDS, "Wish was not saved through UI");
    }

    private void savings(String name, String kind, String amount, String note) throws Exception {
        click(goalButton(name, "allocation".equals(kind) ? "Add saved amount" : "Remove money"));
        waitForJs("Boolean(document.querySelector('.savings-modal'))", UI_SECONDS, "Savings form did not open");
        setInput(".savings-modal .amount-field input", amount);
        setSelect(".savings-modal label:nth-of-type(2) select", "account-bank");
        setInput(".savings-modal label:last-of-type input", note);
        setInput(".savings-modal input[type=\"date\"]", baseline.getString("date", ""));
        saveModal();
        JSONObject record = waitForRecord("savings_contributions", "note", note);
        assertEquals(kind, record.getString("kind"));
        assertEquals("account-bank", record.getString("accountId"));
    }

    private void assertJar(String name, long saved, long target) throws Exception {
        int rounded = (int) Math.floor(Math.max(0, Math.min(100, (double) saved / target * 100)) + .5);
        String jar = goal(name) + ".querySelector('.animated-jar[role=\"progressbar\"]')";
        waitForJs("Boolean(" + jar + " && Number(" + jar + ".getAttribute('aria-valuenow')) === " + rounded + ")", UI_SECONDS, "Jar progress accessibility value did not match actual savings");
        double translation = 188 - 112 * Math.max(0, Math.min(1, (double) saved / target));
        String transform = jsString(goal(name) + ".querySelector('.jar-liquid').style.transform");
        assertTrue("The SVG fill uses its data-driven vertical transform", transform.startsWith("translateY(") && transform.endsWith("px)"));
        double actual = Double.parseDouble(transform.substring(transform.indexOf('(') + 1, transform.indexOf("px")));
        assertEquals("The actual SVG fill must agree with integer-paise savings", translation, actual, .0001);
    }

    private void assertHome(long availableDelta, long reservedDelta) throws Exception {
        openScreen("Home");
        if (baseline.contains("date")) navigateMonth(baseline.getString("date", ""));
        waitForJs("Boolean(document.querySelector('.balance-card strong'))", UI_SECONDS, "Dashboard balance unavailable");
        assertEquals("Available money must reconcile with allocations/releases", baseline.getLong("available", 0) + availableDelta, money(".balance-card strong"));
        assertEquals("Allocated money must not be duplicated as available", baseline.getLong("reserved", 0) + reservedDelta, money(".allocation-summary span b"));
        assertEquals("Salary counts exactly once", baseline.getLong("income", 0) + 2000000, money(".metric.income strong"));
        assertEquals("Allocations and releases are not expenses", baseline.getLong("expenses", 0), money(".metric.expense strong"));
    }

    private void verifyQaRows() throws Exception {
        JSONObject salary = waitForRecord("transactions", "description", marker + "_SALARY");
        assertEquals(2000000, salary.getLong("amountMinor"));
        assertEquals("income", salary.getString("type"));
        assertEquals("account-bank", salary.getString("accountId"));
        JSONObject phone = waitForRecord("wishlist_items", "name", marker + "_PHONE");
        JSONObject sofa = waitForRecord("wishlist_items", "name", marker + "_SOFA");
        assertEquals(4000000, phone.getLong("targetMinor"));
        assertEquals(5000000, sofa.getLong("targetMinor"));
        assertSavingsRow(marker + "_PHONE_ADD", phone.getString("id"), "allocation", 100000);
        assertSavingsRow(marker + "_PHONE_PART", phone.getString("id"), "withdrawal", 40000);
        assertSavingsRow(marker + "_PHONE_FULL", phone.getString("id"), "withdrawal", 60000);
        assertSavingsRow(marker + "_SOFA_ADD", sofa.getString("id"), "allocation", 500000);
    }

    private void assertSavingsRow(String note, String jarId, String kind, long amount) throws Exception {
        JSONObject entry = waitForRecord("savings_contributions", "note", note);
        assertEquals(jarId, entry.getString("wishlistItemId"));
        assertEquals(kind, entry.getString("kind"));
        assertEquals(amount, entry.getLong("amountMinor"));
        assertEquals("account-bank", entry.getString("accountId"));
        assertEquals(baseline.getString("date", ""), entry.getString("date"));
        if ("withdrawal".equals(kind)) {
            assertEquals(1, entry.getJSONArray("fundingSplits").length());
            assertEquals("account-bank", entry.getJSONArray("fundingSplits").getJSONObject(0).getString("accountId"));
            assertEquals(amount, entry.getJSONArray("fundingSplits").getJSONObject(0).getLong("amountMinor"));
        }
    }

    private JSONObject waitForRecord(String table, String field, String value) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(UI_SECONDS);
        do {
            JSONObject row = findRecord(table, field, value);
            if (row != null) return row;
            Thread.sleep(200);
        } while (System.nanoTime() < deadline);
        throw new AssertionError("The exact QA record did not persist in native SQLite");
    }

    private JSONObject findRecord(String table, String field, String value) throws Exception {
        assertTrue("Only known source tables may be queried", "transactions".equals(table) || "wishlist_items".equals(table) || "savings_contributions".equals(table) || "settings".equals(table));
        File path = context.getDatabasePath("tullipSQLite.db");
        if (!path.isFile()) return null;
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(path.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
             Cursor cursor = db.query(table, new String[] { "payload" }, "instr(payload, ?) > 0", new String[] { quote(field) + ":" + quote(value) }, null, null, null)) {
            if (!cursor.moveToFirst()) return null;
            JSONObject row = new JSONObject(cursor.getString(0));
            assertEquals("Only the exact QA row may match", value, row.getString(field));
            assertFalse("The QA operation created duplicate records", cursor.moveToNext());
            return row;
        }
    }

    private void saveModal() throws Exception {
        click("document.querySelector('.modal-actions .primary-button')");
        waitForJs("!document.querySelector('.modal')", UI_SECONDS, "The UI operation did not save; inspect visible form error");
    }

    private void openScreen(String label) throws Exception {
        click("Array.from(document.querySelectorAll('.bottom-nav button')).find(button => button.textContent.includes(" + quote(label) + "))");
        String ready = "Home".equals(label) ? "Boolean(document.querySelector('.balance-card strong'))"
            : "Boolean(document.querySelector('.page-heading h1') && document.querySelector('.page-heading h1').textContent.includes(" + quote("Goals".equals(label) ? "Wish jar" : label) + "))";
        waitForJs(ready, UI_SECONDS, "The requested screen did not load");
    }

    private void navigateMonth(String date) throws Exception {
        int target = Integer.parseInt(date.substring(0, 4)) * 12 + Integer.parseInt(date.substring(5, 7)) - 1;
        int current = Integer.parseInt(evaluate("(() => { const label=document.querySelector('.month-label'); if(!label) return -1; const today=new Date(); for(let offset=-120;offset<=120;offset++){const candidate=new Date(today.getFullYear(),today.getMonth()+offset,1,12);const title=new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(candidate);if(label.textContent.startsWith(title))return candidate.getFullYear()*12+candidate.getMonth();}return -1;})()"));
        assertTrue("The displayed month must be identifiable", current >= 0 && Math.abs(target - current) <= 120);
        while (current != target) {
            int direction = target > current ? 1 : -1;
            click("document.querySelector('button[aria-label=\"" + (direction > 0 ? "Next month" : "Previous month") + "\"]')");
            current += direction;
            waitForJs("document.querySelector('.month-label').textContent.startsWith(new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(new Date(" + current / 12 + "," + current % 12 + ",1,12)))", UI_SECONDS, "Month navigation did not settle");
        }
    }

    private String goal(String name) {
        return "Array.from(document.querySelectorAll('.goal-card')).find(card => card.querySelector('h2')?.textContent === " + quote(name) + ")";
    }

    private String goalButton(String name, String text) {
        return "Array.from(" + goal(name) + ".querySelectorAll('button')).find(button => button.textContent.includes(" + quote(text) + "))";
    }

    private String button(String scope, String text) {
        return "Array.from(document.querySelectorAll(" + quote(scope + " button") + ")).find(button => button.textContent.trim() === " + quote(text) + ")";
    }

    private void setInput(String selector, String value) throws Exception {
        String result = evaluate("(() => {const node = document.querySelector(" + quote(selector) + "); if (!node) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node," + quote(value) + "); node.dispatchEvent(new Event('input',{bubbles:true})); node.dispatchEvent(new Event('change',{bubbles:true})); return true;})()");
        assertEquals("The requested UI input was not available", "true", result);
    }

    private void setSelect(String selector, String value) throws Exception {
        String result = evaluate("(() => {const node = document.querySelector(" + quote(selector) + "); if (!node || !Array.from(node.options).some(option => option.value === " + quote(value) + ")) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(node," + quote(value) + "); node.dispatchEvent(new Event('change',{bubbles:true})); return true;})()");
        assertEquals("The requested account/category/payment option was unavailable", "true", result);
    }

    private void click(String expression) throws Exception {
        assertEquals("The requested UI action was unavailable", "true", evaluate("(() => {const node=" + expression + "; if(!node || node.disabled) return false; node.click(); return true;})()"));
    }

    private long money(String selector) throws Exception {
        return Long.parseLong(evaluate("(() => {const value=document.querySelector(" + quote(selector) + ")?.textContent; if(value===undefined) return null; const parts=new Intl.NumberFormat().formatToParts(12345.67); const group=parts.find(part=>part.type==='group')?.value; const decimal=parts.find(part=>part.type==='decimal')?.value; let normalized=value; if(group) normalized=normalized.split(group).join(''); if(decimal) normalized=normalized.split(decimal).join('.'); const digits=Array.from(new Intl.NumberFormat(undefined,{useGrouping:false}).format(9876543210)).reverse(); normalized=Array.from(normalized).map(char=>digits.includes(char)?String(digits.indexOf(char)):char).join(''); return Math.round(Number(normalized.replace(/[^0-9.\\-]/g,''))*100);})()"));
    }

    private boolean truth(String expression) throws Exception { return "true".equals(evaluate(expression)); }

    private String jsString(String expression) throws Exception {
        Object value = new JSONTokener(evaluate(expression)).nextValue();
        assertTrue("The requested UI value was not a string", value instanceof String);
        return (String) value;
    }

    private void waitForJs(String predicate, long seconds, String message) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
        while (System.nanoTime() < deadline) {
            if (truth(predicate)) return;
            Thread.sleep(250);
        }
        fail(message);
    }

    private String evaluate(String javascript) throws Exception {
        CountDownLatch evaluated = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>("null");
        AtomicReference<Throwable> failure = new AtomicReference<>();
        mainHandler.post(() -> {
            try {
                if (activity.getBridge() == null || activity.getBridge().getWebView() == null) { evaluated.countDown(); return; }
                activity.getBridge().getWebView().evaluateJavascript(javascript, value -> { result.set(value); evaluated.countDown(); });
            } catch (Throwable caught) { failure.set(caught); evaluated.countDown(); }
        });
        evaluated.await(5, TimeUnit.SECONDS);
        if (failure.get() != null) throw new AssertionError("WebView evaluation failed", failure.get());
        return result.get();
    }

    private static String quote(String value) { return JSONObject.quote(value); }
}
