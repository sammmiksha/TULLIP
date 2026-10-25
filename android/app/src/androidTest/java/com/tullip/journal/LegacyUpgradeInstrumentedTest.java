package com.tullip.journal;

import static org.junit.Assert.*;
import static org.junit.Assume.*;

import android.app.Instrumentation;
import android.content.ContentValues;
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
import java.util.Iterator;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Opt-in upgrade test: install preserved schema-1 APK + current test APK, run legacyStage=create;
 * force-stop, install the new APK with adb install -r, run legacyStage=verify with same legacyMarker.
 * Income and goal are created through the old UI. The sole direct SQL write is a new, exact QA
 * legacy planning fixture attached to that newly-created QA goal. No existing row is changed.
 */
@RunWith(AndroidJUnit4.class)
public class LegacyUpgradeInstrumentedTest {
    private static final long UI_SECONDS = 45;
    private Instrumentation instrumentation;
    private Context context;
    private MainActivity activity;
    private Handler mainHandler;
    private SharedPreferences fixture;
    private String marker;

    @Test
    public void originalV1RowsSurviveActualApkUpgrade() throws Exception {
        Bundle arguments = InstrumentationRegistry.getArguments();
        String stage = arguments.getString("legacyStage", "");
        marker = arguments.getString("legacyMarker", "");
        assumeTrue("Explicit upgrade stage and QA marker required", !stage.isEmpty() && !marker.isEmpty());
        assertTrue("Use create or verify stage", "create".equals(stage) || "verify".equals(stage));
        assertTrue("Use a fresh bounded non-personal QA marker", marker.matches("TULLIP_QA_[A-Za-z0-9_-]{1,32}"));
        assumeTrue("Only disposable emulators may run upgrade fixtures", Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("goldfish"));
        instrumentation = InstrumentationRegistry.getInstrumentation();
        context = instrumentation.getTargetContext();
        mainHandler = new Handler(Looper.getMainLooper());
        fixture = context.getSharedPreferences("legacy_upgrade_" + marker, Context.MODE_PRIVATE);
        activity = (MainActivity) instrumentation.startActivitySync(new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            waitFor("Boolean(document.querySelector('.bottom-nav') && document.querySelector('.balance-card strong'))", 120,
                "The local dashboard did not load; an upgrade must not force existing users into onboarding");
            if ("create".equals(stage)) createLegacyFixture(); else verifyUpgrade();
        } finally { mainHandler.post(activity::finish); }
    }

    private void createLegacyFixture() throws Exception {
        assertFalse("Install preserved schema-1 APK on a disposable schema-1 database", hasMigration(2));
        assertFalse("Fresh marker required", fixture.contains("transactionRaw"));
        assertNull(rawMatch("transactions", "description", marker + "_LEGACY_INCOME"));
        assertNull(rawMatch("wishlist_items", "name", marker + "_LEGACY_JAR"));
        long incomeBefore = money(".metric.income strong");
        long expenseBefore = money(".metric.expense strong");
        long availableBefore = money(".balance-card strong");

        click("document.querySelector('button[aria-label=\"Add transaction\"]')");
        waitFor("Boolean(document.querySelector('.type-toggle'))", UI_SECONDS, "Old transaction form did not open");
        click("Array.from(document.querySelectorAll('.type-toggle button')).find(button=>button.textContent.includes('Income'))");
        waitFor("document.querySelector('#transaction-title').textContent.includes('win')", UI_SECONDS, "Old income form did not initialize");
        setInput(".modal .amount-field input", "321.09");
        setInput(".modal input[placeholder=\"What was this for?\"]", marker + "_LEGACY_INCOME");
        String day = string("document.querySelector('.modal input[type=\"date\"]').value");
        click("document.querySelector('.modal-actions .primary-button')");
        waitFor("!document.querySelector('.modal')", UI_SECONDS, "Old income did not save");
        String transactionRaw = waitForRecord("transactions", "description", marker + "_LEGACY_INCOME");
        JSONObject transaction = new JSONObject(transactionRaw);
        assertEquals("income", transaction.getString("type"));
        assertEquals(32109, transaction.getLong("amountMinor"));
        assertFalse("Old UI transaction has no account; migration must not invent its source", transaction.has("accountId"));
        assertEquals(incomeBefore + 32109, money(".metric.income strong"));
        assertEquals(expenseBefore, money(".metric.expense strong"));
        assertEquals(availableBefore + 32109, money(".balance-card strong"));

        openScreen("Goals", "Wish jar");
        click("document.querySelector('.page-heading .primary-button')");
        waitFor("Boolean(document.querySelector('.form-card'))", UI_SECONDS, "Old wish form did not open");
        setInput(".form-card label:first-child input", marker + "_LEGACY_JAR");
        setInput(".form-card label:nth-child(2) input", "1000");
        click("document.querySelector('.form-card .primary-button')");
        waitFor("!document.querySelector('.form-card')", UI_SECONDS, "Old wish was not saved");
        String goalRaw = waitForRecord("wishlist_items", "name", marker + "_LEGACY_JAR");
        JSONObject goal = new JSONObject(goalRaw);
        assertEquals(100000, goal.getLong("targetMinor"));
        String contributionId = marker + "_LEGACY_PLAN";
        JSONObject contribution = new JSONObject();
        contribution.put("id", contributionId);
        contribution.put("wishlistItemId", goal.getString("id"));
        contribution.put("amountMinor", 11111);
        contribution.put("date", day);
        contribution.put("note", marker + "_LEGACY_PLAN");
        contribution.put("createdAt", transaction.getString("createdAt"));
        contribution.put("updatedAt", transaction.getString("updatedAt"));
        String contributionRaw = contribution.toString();
        // Standard migration fixture: only a new QA row, scoped by this test's exact new jar ID.
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(databasePath().getAbsolutePath(), null, SQLiteDatabase.OPEN_READWRITE)) {
            db.beginTransaction();
            try (Cursor existing = db.query("savings_contributions", new String[] { "id" }, "id=?", new String[] { contributionId }, null, null, null)) {
                assertFalse("Never overwrite a prior planning fixture", existing.moveToFirst());
                ContentValues values = new ContentValues();
                values.put("id", contributionId); values.put("payload", contributionRaw);
                values.put("wishlist_item_id", goal.getString("id")); values.put("date", day);
                values.put("updated_at", contribution.getString("updatedAt"));
                db.insertOrThrow("savings_contributions", null, values);
                db.setTransactionSuccessful();
            } finally { db.endTransaction(); }
        }
        assertEquals(contributionRaw, rawMatch("savings_contributions", "id", contributionId));
        String settingsRaw = rawMatch("settings", "id", "app");
        assertNotNull(settingsRaw);
        assertTrue(fixture.edit().putString("transactionRaw", transactionRaw).putString("goalRaw", goalRaw)
            .putString("contributionRaw", contributionRaw).putString("settingsRaw", settingsRaw).putString("date", day)
            .putLong("incomeAfter", incomeBefore + 32109).putLong("expenseAfter", expenseBefore)
            .putLong("availableAfter", availableBefore + 32109).commit());
    }

    private void verifyUpgrade() throws Exception {
        assertTrue("First create the exact fixture using the preserved old APK", fixture.contains("transactionRaw"));
        assertTrue("Native schema migration 2 was not applied", hasMigration(2));
        String transactionRaw = rawMatch("transactions", "description", marker + "_LEGACY_INCOME");
        String goalRaw = rawMatch("wishlist_items", "name", marker + "_LEGACY_JAR");
        String contributionRaw = rawMatch("savings_contributions", "id", marker + "_LEGACY_PLAN");
        assertEquals("Historical transaction JSON must remain byte-for-byte unchanged", fixture.getString("transactionRaw", ""), transactionRaw);
        assertEquals("Historical wish JSON must remain byte-for-byte unchanged", fixture.getString("goalRaw", ""), goalRaw);
        assertEquals("Historical planning JSON must remain byte-for-byte unchanged", fixture.getString("contributionRaw", ""), contributionRaw);
        JSONObject settingsBefore = new JSONObject(fixture.getString("settingsRaw", ""));
        JSONObject settingsAfter = new JSONObject(rawMatch("settings", "id", "app"));
        Iterator<String> fields = settingsBefore.keys();
        while (fields.hasNext()) {
            String key = fields.next();
            assertEquals("Migration must preserve every original setting", settingsBefore.get(key), settingsAfter.get(key));
        }
        assertTrue("Existing users must bypass onboarding after migration", settingsAfter.getBoolean("onboardingCompleted"));
        assertEquals("account-legacy", settingsAfter.getString("openingBalanceAccountId"));
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(databasePath().getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
             Cursor accounts = db.rawQuery("SELECT COUNT(*) FROM accounts WHERE id IN (?,?,?)", new String[] { "account-bank", "account-cash", "account-legacy" })) {
            assertTrue(accounts.moveToFirst());
            assertEquals("Default accounts must be added without replacing history", 3, accounts.getInt(0));
        }
        assertFalse("An upgraded journal must not show onboarding", truth("Boolean(document.querySelector('#onboarding-heading'))"));
        assertEquals("Income must not be counted twice during migration", fixture.getLong("incomeAfter", 0), money(".metric.income strong"));
        assertEquals("Old planning must not become an expense", fixture.getLong("expenseAfter", 0), money(".metric.expense strong"));
        assertEquals("Old planning must not silently reserve previously available funds", fixture.getLong("availableAfter", 0), money(".balance-card strong"));
        assertEquals("Old planning is not an account-aware allocation", 0, money(".allocation-summary span b"));
        openScreen("Goals", "Wish jar");
        String card = "Array.from(document.querySelectorAll('.goal-card')).find(card=>card.querySelector('h2')?.textContent===" + quote(marker + "_LEGACY_JAR") + ")";
        waitFor("Boolean(" + card + " && " + card + ".querySelector('.legacy-note'))", UI_SECONDS, "The legacy planning amount was not explained separately");
        assertTrue("The original planning amount must remain readable", truth(card + ".querySelector('.legacy-note').textContent.includes(new Intl.NumberFormat(undefined,{style:'currency',currency:" + quote(settingsAfter.getString("currency")) + "}).format(111.11))"));
        assertEquals("Actual reserved savings must remain empty", "0", string(card + ".querySelector('[role=\"progressbar\"]').getAttribute('aria-valuenow')"));
        assertTrue(truth(card + ".querySelector('.jar-liquid').style.transform === 'translateY(188px)'"));
        click("Array.from(" + card + ".querySelectorAll('button')).find(button=>button.textContent.includes('View savings history'))");
        waitFor(card + ".querySelectorAll('.history-entry').length === 1", UI_SECONDS, "Original planning history did not persist");
        assertTrue(truth(card + ".querySelector('.history-entry').textContent.includes('Legacy planning')"));
        openScreen("Settings", "Settings");
        String historical = "Array.from(document.querySelectorAll('.account-row')).find(row=>row.querySelector('b')?.textContent==='Historical / unassigned')";
        waitFor("Boolean(" + historical + ")", UI_SECONDS, "Historical account was not shown");
        assertEquals("Legacy account holds the original net balance, not fictitious bank funds", fixture.getLong("availableAfter", 0), moneyExpression(historical + ".querySelector('div small').textContent"));
    }

    private boolean hasMigration(int version) {
        if (!databasePath().isFile()) return false;
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(databasePath().getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
             Cursor row = db.rawQuery("SELECT version FROM schema_migrations WHERE version=?", new String[] { String.valueOf(version) })) {
            return row.moveToFirst();
        }
    }

    private File databasePath() { return context.getDatabasePath("tullipSQLite.db"); }

    private String waitForRecord(String table, String field, String value) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(UI_SECONDS);
        do { String result = rawMatch(table, field, value); if (result != null) return result; Thread.sleep(200); }
        while (System.nanoTime() < until);
        throw new AssertionError("The exact QA row did not persist in native SQLite");
    }

    private String rawMatch(String table, String field, String value) throws Exception {
        assertTrue("Only upgrade fixture tables may be read", "transactions".equals(table) || "wishlist_items".equals(table) || "savings_contributions".equals(table) || "settings".equals(table));
        if (!databasePath().isFile()) return null;
        try (SQLiteDatabase db = SQLiteDatabase.openDatabase(databasePath().getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
             Cursor rows = db.query(table, new String[] { "payload" }, "instr(payload,?)>0", new String[] { quote(field) + ":" + quote(value) }, null, null, null)) {
            if (!rows.moveToFirst()) return null;
            String raw = rows.getString(0);
            assertEquals(value, new JSONObject(raw).getString(field));
            assertFalse("Upgrade fixtures must never be duplicated", rows.moveToNext());
            return raw;
        }
    }

    private void openScreen(String nav, String heading) throws Exception {
        click("Array.from(document.querySelectorAll('.bottom-nav button')).find(button=>button.textContent.includes(" + quote(nav) + "))");
        waitFor("Boolean(document.querySelector('.page-heading h1') && document.querySelector('.page-heading h1').textContent.includes(" + quote(heading) + "))", UI_SECONDS, "The requested screen did not load");
    }

    private void setInput(String selector, String value) throws Exception {
        assertEquals("Requested input missing", "true", evaluate("(()=>{const input=document.querySelector(" + quote(selector) + ");if(!input)return false;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input," + quote(value) + ");input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true;})()"));
    }

    private void click(String expression) throws Exception {
        assertEquals("Requested UI action missing", "true", evaluate("(()=>{const node=" + expression + ";if(!node||node.disabled)return false;node.click();return true;})()"));
    }

    private long money(String selector) throws Exception { return moneyExpression("document.querySelector(" + quote(selector) + ")?.textContent"); }
    private long moneyExpression(String expression) throws Exception {
        return Long.parseLong(evaluate("(()=>{let text=" + expression + ";const parts=new Intl.NumberFormat().formatToParts(12345.67);const group=parts.find(part=>part.type==='group')?.value;const decimal=parts.find(part=>part.type==='decimal')?.value;if(group)text=text.split(group).join('');if(decimal)text=text.split(decimal).join('.');const digits=Array.from(new Intl.NumberFormat(undefined,{useGrouping:false}).format(9876543210)).reverse();text=Array.from(text).map(char=>digits.includes(char)?String(digits.indexOf(char)):char).join('');return Math.round(Number(text.replace(/[^0-9.\\-]/g,''))*100);})()"));
    }

    private boolean truth(String expression) throws Exception { return "true".equals(evaluate(expression)); }
    private String string(String expression) throws Exception { return (String) new JSONTokener(evaluate(expression)).nextValue(); }
    private void waitFor(String predicate, long seconds, String message) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
        while (System.nanoTime() < until) { if (truth(predicate)) return; Thread.sleep(250); }
        fail(message);
    }

    private String evaluate(String javascript) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>("null");
        AtomicReference<Throwable> failure = new AtomicReference<>();
        mainHandler.post(() -> {
            try {
                if (activity.getBridge() == null || activity.getBridge().getWebView() == null) { latch.countDown(); return; }
                activity.getBridge().getWebView().evaluateJavascript(javascript, value -> { result.set(value); latch.countDown(); });
            } catch (Throwable caught) { failure.set(caught); latch.countDown(); }
        });
        latch.await(5, TimeUnit.SECONDS);
        if (failure.get() != null) throw new AssertionError("WebView evaluation failed", failure.get());
        return result.get();
    }

    private static String quote(String value) { return JSONObject.quote(value); }
}
