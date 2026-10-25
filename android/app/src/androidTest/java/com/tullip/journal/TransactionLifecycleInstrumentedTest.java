package com.tullip.journal;

import static org.junit.Assert.*;

import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Bundle;
import android.os.Build;
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
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Opt-in UI/data lifecycle check. Run create, force-stop the application, and
 * run verify with the same unique QA marker in a separate instrumentation run.
 * Ordinary smoke runs skip this test and never create a transaction.
 */
@RunWith(AndroidJUnit4.class)
public class TransactionLifecycleInstrumentedTest {
    private static final long STARTUP_SECONDS = 90;
    private static final long UI_SECONDS = 45;
    private static final int AMOUNT_MINOR = 12345;

    private Instrumentation instrumentation;
    private Context context;
    private MainActivity activity;
    private Handler mainHandler;

    @Test
    public void transactionUiAndProcessRestartFlow() throws Exception {
        Bundle arguments = InstrumentationRegistry.getArguments();
        String stage = arguments.getString("stage");
        String note = arguments.getString("note");
        Assume.assumeTrue("Explicit stage and QA marker are required", stage != null && note != null);
        assertTrue("Stage must be create or verify", "create".equals(stage) || "verify".equals(stage));
        assertTrue("Use a unique non-personal TULLIP_QA_ marker", note.matches("TULLIP_QA_[A-Za-z0-9_-]{1,100}"));
        Assume.assumeTrue("Only disposable emulators may run this opt-in flow", Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("goldfish"));

        instrumentation = InstrumentationRegistry.getInstrumentation();
        context = instrumentation.getTargetContext();
        mainHandler = new Handler(Looper.getMainLooper());
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        activity = (MainActivity) instrumentation.startActivitySync(intent);

        try {
            waitForJs(
                "Boolean(document.querySelector('.bottom-nav') && document.body.innerText.includes('Available balance'))",
                STARTUP_SECONDS,
                "The local dashboard did not finish loading"
            );

            if ("create".equals(stage)) {
                createTransactionThroughUi(note);
            } else {
                verifyPersistedTransactionAndScreens(note);
            }
        } finally {
            mainHandler.post(activity::finish);
        }
    }

    private void createTransactionThroughUi(String note) throws Exception {
        assertNull("Use a fresh QA marker rather than adding a duplicate", readQaTransaction(note));
        assertNull("Use a fresh funding marker", readQaTransaction(note + "_FUNDING"));
        // Fund the selected account through the real UI before spending. This keeps the
        // smoke flow valid under account-aware insufficient-funds checks on a new journal.
        clickJs("document.querySelector('button[aria-label=\"Add transaction\"]')", "The Add transaction action was not available");
        waitForJs("Boolean(document.querySelector('.type-toggle'))", UI_SECONDS, "The funding form did not open");
        clickJs("Array.from(document.querySelectorAll('.type-toggle button')).find(button => button.textContent.includes('Income'))", "The income action was unavailable");
        waitForJs("document.querySelector('#transaction-title').textContent.includes('win')", UI_SECONDS, "The income form did not initialize");
        setInput(".modal .amount-field input", "123.45");
        setInput(".modal input[placeholder=\"What was this for?\"]", note + "_FUNDING");
        clickJs("document.querySelector('.modal-actions .primary-button')", "The funding Save action was not available");
        waitForJs("!document.querySelector('.modal')", UI_SECONDS, "The funding transaction did not save");
        JSONObject funding = waitForQaTransaction(note + "_FUNDING");
        assertEquals("income", funding.getString("type"));
        assertEquals(AMOUNT_MINOR, funding.getInt("amountMinor"));
        clickJs(
            "document.querySelector('button[aria-label=\"Add transaction\"]')",
            "The Add transaction action was not available"
        );
        waitForJs(
            "Boolean(document.querySelector('.modal .amount-field input') && "
                + "document.querySelector('.modal > form > label select').value && "
                + "document.querySelector('.modal .form-two label:first-child select').value && "
                + "document.querySelector('.modal .form-two label:last-child select').value)",
            UI_SECONDS,
            "The transaction form did not initialize its default category/payment"
        );

        String transactionDate = jsString("document.querySelector('.modal input[type=\"date\"]').value");
        assertTrue("The default transaction date must be an ISO date", transactionDate.matches("\\d{4}-\\d{2}-\\d{2}"));
        setInput(".modal .amount-field input", "123.45");
        setInput(".modal input[placeholder=\"What was this for?\"]", note);
        clickJs("document.querySelector('.modal-actions .primary-button')", "The Save entry action was not available");
        waitForJs("!document.querySelector('.modal')", UI_SECONDS, "The transaction form did not complete saving");

        JSONObject saved = waitForQaTransaction(note);
        assertQaTransaction(saved, note);
        assertEquals("Expense must use the account funded through the UI", funding.getString("accountId"), saved.getString("accountId"));
        assertEquals("The saved date must match the form's actual default date", transactionDate, saved.getString("date"));
        openJournalAndFind(note);
    }

    private void verifyPersistedTransactionAndScreens(String note) throws Exception {
        JSONObject saved = waitForQaTransaction(note);
        assertQaTransaction(saved, note);
        JSONObject funding = waitForQaTransaction(note + "_FUNDING");
        assertEquals("income", funding.getString("type"));
        assertEquals(AMOUNT_MINOR, funding.getInt("amountMinor"));
        assertEquals(funding.getString("accountId"), saved.getString("accountId"));
        String transactionDate = saved.getString("date");
        String categoryName = readRelatedCategoryName(saved.getString("categoryId"));

        openJournalAndFind(note);

        openScreen("Calendar", "Calendar");
        navigateToTransactionMonth(transactionDate);
        int day = Integer.parseInt(transactionDate.substring(8, 10));
        String dayButton = "Array.from(document.querySelectorAll('.calendar-grid button:not(.outside)'))"
            + ".find(button => button.querySelector('b') && Number(button.querySelector('b').textContent) === " + day + ")";
        waitForJs(
            "Boolean((() => { const button = " + dayButton + "; return button && button.querySelector('em.expense'); })())",
            UI_SECONDS,
            "The calendar date does not show the persisted expense marker"
        );
        clickJs(dayButton, "The saved transaction's calendar day was not available");
        waitForJs(
            "Array.from(document.querySelectorAll('.transaction-list .transaction-copy b'))"
                + ".some(element => element.textContent === " + JSONObject.quote(note) + ")",
            UI_SECONDS,
            "The saved transaction was not shown on its calendar date"
        );

        openScreen("Reports", "Reports");
        navigateToTransactionMonth(transactionDate);
        waitForJs(
            "(() => { " + moneyMinorFunction()
                + " const expense = document.querySelector('.metric.expense strong');"
                + " const category = Array.from(document.querySelectorAll('.report-section .report-line')).find(row => "
                + "row.querySelector('span') && row.querySelector('span').textContent.trim().endsWith(" + JSONObject.quote(categoryName) + "));"
                + " return Boolean(expense && moneyMinor(expense.textContent) >= " + AMOUNT_MINOR
                + " && category && category.querySelector('b') && moneyMinor(category.querySelector('b').textContent) >= " + AMOUNT_MINOR + "); })()",
            UI_SECONDS,
            "The monthly report did not include the persisted expense amount/category"
        );

        openScreen("Goals", "Wish jar");
        waitForJs(
            "Boolean(document.querySelector('.goal-grid') && document.querySelector('.page-note'))",
            UI_SECONDS,
            "The wishlist/savings screen did not load"
        );
        openScreen("Settings", "Settings");
        waitForJs(
            "Boolean(document.querySelector('.settings-form select') && document.querySelector('.data-card') && "
                + "document.querySelector('.privacy-card'))",
            UI_SECONDS,
            "The settings, backup, and privacy sections did not load"
        );
    }

    private void openJournalAndFind(String note) throws Exception {
        openScreen("Journal", "Journal");
        setInput("input[data-tour=\"journal-search\"]", note);
        waitForJs(
            "Array.from(document.querySelectorAll('.journal-list .transaction-copy b'))"
                + ".some(element => element.textContent === " + JSONObject.quote(note) + ")",
            UI_SECONDS,
            "The journal search did not show the exact QA transaction"
        );
    }

    private void openScreen(String navigationLabel, String heading) throws Exception {
        clickJs(
            "Array.from(document.querySelectorAll('.bottom-nav button')).find(button => button.textContent.includes("
                + JSONObject.quote(navigationLabel) + "))",
            "The requested navigation action was not available"
        );
        waitForJs(
            "Boolean(document.querySelector('.page-heading h1') && document.querySelector('.page-heading h1').textContent.includes("
                + JSONObject.quote(heading) + "))",
            UI_SECONDS,
            "The requested core screen did not load"
        );
    }

    private void navigateToTransactionMonth(String date) throws Exception {
        int target = Integer.parseInt(date.substring(0, 4)) * 12 + Integer.parseInt(date.substring(5, 7)) - 1;
        String rawMonth = evaluateJs(
            "(() => { const label = document.querySelector('.month-label'); if (!label) return -1; "
                + "const now = new Date(); for (let offset = -120; offset <= 120; offset++) { "
                + "const candidate = new Date(now.getFullYear(), now.getMonth() + offset, 1, 12); "
                + "const title = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(candidate); "
                + "if (label.textContent.startsWith(title)) return candidate.getFullYear() * 12 + candidate.getMonth(); } return -1; })()",
            5000
        );
        int current = Integer.parseInt(rawMonth);
        assertTrue("The displayed calendar/report month could not be identified", current >= 0);
        assertTrue("The QA transaction is outside the bounded month navigation range", Math.abs(target - current) <= 120);
        while (current != target) {
            int direction = target > current ? 1 : -1;
            clickJs(
                "document.querySelector('button[aria-label=\"" + (direction > 0 ? "Next month" : "Previous month") + "\"]')",
                "Month navigation was not available"
            );
            current += direction;
            int year = current / 12;
            int month = current % 12;
            waitForJs(
                "Boolean(document.querySelector('.month-label') && document.querySelector('.month-label').textContent.startsWith("
                    + "new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(" + year + ", " + month + ", 1, 12))))",
                UI_SECONDS,
                "The calendar/report month did not change"
            );
        }
    }

    private void setInput(String selector, String value) throws Exception {
        String result = evaluateJs(
            "(() => { const input = document.querySelector(" + JSONObject.quote(selector) + "); if (!input) return false; "
                + "const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; "
                + "setter.call(input, " + JSONObject.quote(value) + "); "
                + "input.dispatchEvent(new Event('input', { bubbles: true })); "
                + "input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()",
            5000
        );
        assertEquals("The requested form input was not available", "true", result);
    }

    private void clickJs(String elementExpression, String failureMessage) throws Exception {
        String result = evaluateJs(
            "(() => { const element = " + elementExpression + "; if (!element || element.disabled) return false; element.click(); return true; })()",
            5000
        );
        assertEquals(failureMessage, "true", result);
    }

    private void waitForJs(String predicate, long seconds, String failureMessage) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds);
        while (System.nanoTime() < deadline) {
            long remainingMillis = TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime());
            if ("true".equals(evaluateJs(predicate, Math.max(1, Math.min(5000, remainingMillis))))) return;
            if (System.nanoTime() < deadline) Thread.sleep(250);
        }
        fail(failureMessage);
    }

    private String evaluateJs(String javascript, long timeoutMillis) throws Exception {
        CountDownLatch evaluated = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>("null");
        AtomicReference<Throwable> error = new AtomicReference<>();
        mainHandler.post(() -> {
            try {
                if (activity.getBridge() == null || activity.getBridge().getWebView() == null) {
                    evaluated.countDown();
                    return;
                }
                activity.getBridge().getWebView().evaluateJavascript(javascript, value -> {
                    result.set(value);
                    evaluated.countDown();
                });
            } catch (Throwable caught) {
                error.set(caught);
                evaluated.countDown();
            }
        });
        evaluated.await(timeoutMillis, TimeUnit.MILLISECONDS);
        if (error.get() != null) throw new AssertionError("WebView evaluation failed", error.get());
        return result.get();
    }

    private String jsString(String javascript) throws Exception {
        Object value = new JSONTokener(evaluateJs(javascript, 5000)).nextValue();
        assertTrue("The requested UI value was not a string", value instanceof String);
        return (String) value;
    }

    private JSONObject waitForQaTransaction(String note) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(UI_SECONDS);
        do {
            JSONObject saved = readQaTransaction(note);
            if (saved != null) return saved;
            Thread.sleep(250);
        } while (System.nanoTime() < deadline);
        throw new AssertionError("The exact QA transaction was not found in native SQLite");
    }

    private JSONObject readQaTransaction(String note) throws Exception {
        File path = context.getDatabasePath("tullipSQLite.db");
        if (!path.isFile()) return null;
        try (SQLiteDatabase database = SQLiteDatabase.openDatabase(path.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
             Cursor cursor = database.query(
                 "transactions", new String[] { "payload" }, "instr(payload, ?) > 0",
                 new String[] { "\"description\":" + JSONObject.quote(note) }, null, null, null
             )) {
            if (!cursor.moveToFirst()) return null;
            JSONObject saved = new JSONObject(cursor.getString(0));
            assertEquals("Only the exact QA marker may be read", note, saved.getString("description"));
            assertFalse("The QA marker matched duplicate transactions", cursor.moveToNext());
            return saved;
        }
    }

    private String readRelatedCategoryName(String categoryId) throws Exception {
        File path = context.getDatabasePath("tullipSQLite.db");
        try (SQLiteDatabase database = SQLiteDatabase.openDatabase(path.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
             Cursor cursor = database.query("categories", new String[] { "payload" }, "id=?", new String[] { categoryId }, null, null, null)) {
            assertTrue("The QA transaction's related category was not found", cursor.moveToFirst());
            return new JSONObject(cursor.getString(0)).getString("name");
        }
    }

    private void assertQaTransaction(JSONObject saved, String note) throws Exception {
        assertEquals("The QA transaction description must survive restart", note, saved.getString("description"));
        assertEquals("The expense must store integer paise", AMOUNT_MINOR, saved.getInt("amountMinor"));
        assertEquals("The transaction must be an expense", "expense", saved.getString("type"));
        assertTrue("The saved transaction date must be an ISO date", saved.getString("date").matches("\\d{4}-\\d{2}-\\d{2}"));
    }

    private String moneyMinorFunction() {
        return "const moneyMinor = text => { "
            + "const formatter = new Intl.NumberFormat(); const parts = formatter.formatToParts(12345.67); "
            + "const group = (parts.find(part => part.type === 'group') || {}).value; "
            + "const decimal = (parts.find(part => part.type === 'decimal') || {}).value; "
            + "let normalized = text || ''; if (group) normalized = normalized.split(group).join(''); "
            + "if (decimal) normalized = normalized.split(decimal).join('.'); "
            + "const digits = Array.from(new Intl.NumberFormat(undefined, { useGrouping: false }).format(9876543210)).reverse(); "
            + "normalized = Array.from(normalized).map(character => digits.includes(character) ? String(digits.indexOf(character)) : character).join(''); "
            + "return Math.round(Number(normalized.replace(/[^0-9.\\-]/g, '')) * 100); }; ";
    }
}
