package com.tullip.journal;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Build;
import android.text.InputFilter;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The native privacy gate remains active independently of JavaScript. */
public class MainActivity extends BridgeActivity {
    private static final int PLUM = Color.rgb(81, 35, 111);
    private static final int PAPER = Color.rgb(255, 253, 251);
    private static final int LAVENDER = Color.rgb(233, 221, 247);
    private AppPinStore pinStore;
    private boolean authenticated;
    private boolean promptActive;
    private boolean legacyPromptActive;
    private boolean hashing;
    private long flowId;
    private String pendingAction;
    private AuthenticationResult pendingResult;
    private FrameLayout shield;
    private TextView shieldMessage;
    private Button unlockButton;
    private AppLockPlugin lockPlugin;
    private AlertDialog pinDialog;
    private EditText pinInput;
    private TextView pinHint;
    private Button submitButton;
    private String step;
    private char[] proposedPin;
    private final ExecutorService pinWorker = Executors.newSingleThreadExecutor();

    interface AuthenticationResult { void complete(boolean authenticated, String error); }

    // Used only to protect migration of an already-enabled 0.2 device lock. Fresh
    // setup and every subsequent unlock use TULLIP's own PIN, without Keyguard.
    private final ActivityResultLauncher<Intent> legacyCredentialLauncher = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(), result -> {
            if (!legacyPromptActive) return;
            legacyPromptActive = false;
            if (result.getResultCode() != Activity.RESULT_OK) {
                finishFlow(false, null);
                return;
            }
            if ("disable".equals(pendingAction)) {
                try { pinStore.disable(); finishFlow(true, null); }
                catch (RuntimeException error) { finishFlow(false, error.getMessage()); }
            } else {
                // Do not expose any records between legacy confirmation and PIN enrollment.
                showPinDialog("new");
            }
        }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        pinStore = new AppPinStore(this);
        authenticated = !pinStore.enabled();
        if (pinStore.enabled()) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        registerPlugin(AppLockPlugin.class);
        super.onCreate(savedInstanceState);
        applyPaperSystemBars();
        createShield();
        updateShield();
    }

    @SuppressWarnings("deprecation")
    private void applyPaperSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(Build.VERSION.SDK_INT >= 26);
        if (Build.VERSION.SDK_INT < 35) {
            getWindow().setStatusBarColor(PAPER);
            getWindow().setNavigationBarColor(Build.VERSION.SDK_INT >= 26 ? PAPER : PLUM);
        }
    }

    JSObject lockStatus() {
        JSObject status = new JSObject();
        status.put("supported", true);
        status.put("available", true);
        status.put("enabled", pinStore.enabled());
        status.put("locked", pinStore.enabled() && !authenticated);
        status.put("method", pinStore.legacy() ? "legacy_device_credential" : "app_pin");
        status.put("migrationRequired", pinStore.legacy());
        status.put("retryAfterSeconds", (long) Math.ceil(pinStore.remainingMillis() / 1000.0));
        return status;
    }

    void setLockPlugin(AppLockPlugin plugin) { lockPlugin = plugin; }
    private void notifyLockState() { if (lockPlugin != null) lockPlugin.publishStatus(lockStatus()); }

    void lockJournal() {
        if (pinStore.enabled()) {
            authenticated = false;
            updateShield();
            notifyLockState();
        }
    }

    void requestCredential(String action, AuthenticationResult callback) {
        if (promptActive) { callback.complete(false, "A TULLIP PIN request is already open."); return; }
        if (!("enable".equals(action) || "unlock".equals(action) || "change".equals(action) || "disable".equals(action))) {
            callback.complete(false, "Unknown app-lock action."); return;
        }
        if (!pinStore.enabled() && ("unlock".equals(action) || "disable".equals(action))) {
            callback.complete(true, null); return;
        }
        if (pinStore.enabled() && "enable".equals(action)) {
            callback.complete(false, "App lock is already enabled. Use Change TULLIP PIN."); return;
        }
        if (!pinStore.enabled() && "change".equals(action)) {
            callback.complete(false, "Set up your TULLIP PIN first."); return;
        }
        promptActive = true;
        pendingAction = action;
        pendingResult = callback;
        flowId++;
        updateShield();
        if (pinStore.legacy()) requestLegacyMigration();
        else showPinDialog(pinStore.enabled() ? "verify" : "new");
    }

    @SuppressWarnings("deprecation")
    private void requestLegacyMigration() {
        KeyguardManager manager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        if (manager == null || !manager.isDeviceSecure()) {
            finishFlow(false, "Your previous device lock still protects this journal. Restore the original Android screen lock to upgrade it safely; there is no PIN reset bypass.");
            return;
        }
        Intent intent = manager.createConfirmDeviceCredentialIntent("Upgrade TULLIP privacy",
            "Confirm your existing protection once, then create your own TULLIP PIN.");
        if (intent == null) { finishFlow(false, "Android could not verify the existing lock. Your journal stays protected."); return; }
        legacyPromptActive = true;
        try { legacyCredentialLauncher.launch(intent); }
        catch (RuntimeException error) {
            legacyPromptActive = false;
            finishFlow(false, "The existing lock could not be verified. Your journal stays protected.");
        }
    }

    private void showPinDialog(String nextStep) {
        step = nextStep;
        if (pinDialog == null) {
            LinearLayout card = new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(22), dp(20), dp(22), dp(12));
            card.setBackground(rounded(PAPER, dp(24)));
            TextView brand = new TextView(this);
            brand.setText("✦  T U L L I P  ✦");
            brand.setTextColor(PLUM);
            brand.setTextSize(15);
            brand.setGravity(Gravity.CENTER);
            brand.setTypeface(Typeface.SERIF, Typeface.BOLD);
            card.addView(brand);
            pinHint = new TextView(this);
            pinHint.setTextColor(PLUM);
            pinHint.setTextSize(16);
            pinHint.setGravity(Gravity.CENTER);
            pinHint.setPadding(0, dp(16), 0, dp(12));
            pinHint.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
            card.addView(pinHint);
            pinInput = new EditText(this);
            pinInput.setId(R.id.tullip_pin_input);
            pinInput.setContentDescription("Six-digit TULLIP PIN");
            pinInput.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
            pinInput.setFilters(new InputFilter[] { new InputFilter.LengthFilter(6) });
            pinInput.setShowSoftInputOnFocus(false);
            pinInput.setSaveEnabled(false);
            pinInput.setPrivateImeOptions("nm");
            pinInput.setImeOptions(EditorInfo.IME_FLAG_NO_EXTRACT_UI | EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING);
            pinInput.setGravity(Gravity.CENTER);
            pinInput.setTextColor(PLUM);
            pinInput.setTextSize(26);
            pinInput.setLetterSpacing(0.3f);
            pinInput.setLongClickable(false);
            pinInput.setTextIsSelectable(false);
            card.addView(pinInput, new LinearLayout.LayoutParams(-1, dp(56)));
            String[][] keys = {{"1", "2", "3"}, {"4", "5", "6"}, {"7", "8", "9"}, {"Clear", "0", "⌫"}};
            for (String[] rowKeys : keys) {
                LinearLayout row = new LinearLayout(this);
                for (String key : rowKeys) {
                    Button button = new Button(this);
                    button.setText(key);
                    button.setAllCaps(false);
                    button.setTextColor(PLUM);
                    button.setTextSize(key.equals("Clear") ? 13 : 22);
                    button.setBackgroundTintList(ColorStateList.valueOf(LAVENDER));
                    button.setContentDescription(key.equals("⌫") ? "Delete last PIN digit" : key.equals("Clear") ? "Clear PIN" : "PIN digit " + key);
                    button.setOnClickListener(view -> {
                        if (hashing) return;
                        if (key.equals("Clear")) pinInput.setText("");
                        else if (key.equals("⌫")) {
                            int length = pinInput.length();
                            if (length > 0) pinInput.getText().delete(length - 1, length);
                        } else pinInput.append(key);
                    });
                    LinearLayout.LayoutParams cell = new LinearLayout.LayoutParams(0, dp(52), 1);
                    cell.setMargins(dp(3), dp(2), dp(3), dp(2));
                    row.addView(button, cell);
                }
                card.addView(row);
            }
            TextView recovery = new TextView(this);
            recovery.setText("Forgot your PIN?");
            recovery.setTextColor(PLUM);
            recovery.setGravity(Gravity.CENTER);
            recovery.setPadding(0, dp(12), 0, dp(8));
            recovery.setMinHeight(dp(48));
            recovery.setOnClickListener(view -> pinHint.setText("There is no recovery account or reset bypass. Remember your PIN and keep private backups. Clearing app storage or uninstalling deletes local records; TULLIP will never do that for you."));
            card.addView(recovery);
            ScrollView scroll = new ScrollView(this);
            scroll.setFillViewport(true);
            scroll.addView(card);
            pinDialog = new AlertDialog.Builder(this).setView(scroll)
                .setNegativeButton("Cancel", (dialog, which) -> finishFlow(false, null))
                .setPositiveButton("Continue", null).create();
            pinDialog.setCanceledOnTouchOutside(false);
            pinDialog.setOnCancelListener(dialog -> finishFlow(false, null));
            pinDialog.show();
            if (pinDialog.getWindow() != null) {
                pinDialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
                pinDialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN);
            }
            submitButton = pinDialog.getButton(AlertDialog.BUTTON_POSITIVE);
            submitButton.setTextColor(PLUM);
            submitButton.setOnClickListener(view -> submitPin());
            pinDialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(PLUM);
        }
        pinInput.setText("");
        pinInput.setEnabled(true);
        hashing = false;
        submitButton.setEnabled(true);
        if ("new".equals(step)) {
            pinHint.setText(pinStore.legacy() ? "Make it yours. Create a new six-digit TULLIP PIN to finish the protected upgrade." : "A little privacy, just for you. Create a six-digit TULLIP PIN.");
            submitButton.setText("Continue");
        } else if ("confirm".equals(step)) {
            pinHint.setText("One more time. Confirm your new six-digit TULLIP PIN.");
            submitButton.setText("Save TULLIP PIN");
        } else {
            pinHint.setText("disable".equals(pendingAction) ? "Enter your TULLIP PIN to turn app lock off." : "change".equals(pendingAction) ? "Enter your current TULLIP PIN first." : "Welcome back. Enter your TULLIP PIN.");
            submitButton.setText("disable".equals(pendingAction) ? "Disable lock" : "change".equals(pendingAction) ? "Continue" : "Unlock");
            showCooldown();
        }
        pinInput.requestFocus();
    }

    private void showCooldown() {
        long remaining = pinStore.remainingMillis();
        if (remaining > 0) pinHint.setText("Too many attempts. Wait " + (long) Math.ceil(remaining / 1000.0) + " seconds, then try again. Your journal stays locked.");
    }

    private void submitPin() {
        if (hashing || pinInput == null) return;
        char[] entered = new char[pinInput.length()];
        pinInput.getText().getChars(0, entered.length, entered, 0);
        pinInput.setText("");
        if (!PinCrypto.validPin(entered)) {
            Arrays.fill(entered, '\0');
            pinHint.setText("Please enter all six digits.");
            return;
        }
        if ("new".equals(step)) {
            clearProposedPin();
            proposedPin = entered;
            showPinDialog("confirm");
            return;
        }
        if ("confirm".equals(step)) {
            if (proposedPin == null || !Arrays.equals(proposedPin, entered)) {
                Arrays.fill(entered, '\0');
                pinHint.setText("Those PINs do not match. Enter the same six digits again, or cancel to start over.");
                return;
            }
            clearProposedPin();
            hashNewPin(entered);
        } else {
            if (pinStore.remainingMillis() > 0) {
                Arrays.fill(entered, '\0');
                showCooldown();
                return;
            }
            verifyPin(entered);
        }
    }

    private void setHashing() {
        hashing = true;
        pinInput.setEnabled(false);
        submitButton.setEnabled(false);
        pinHint.setText("Keeping your journal private…");
    }

    private void hashNewPin(char[] entered) {
        setHashing();
        long request = flowId;
        pinWorker.execute(() -> {
            byte[] salt = PinCrypto.randomSalt();
            byte[] verifier = null;
            try {
                verifier = PinCrypto.derive(entered, salt, PinCrypto.ITERATIONS);
                byte[] derived = verifier;
                runOnUiThread(() -> {
                    try {
                        if (request != flowId || !promptActive) return;
                        pinStore.configure(salt, derived);
                        finishFlow(true, null);
                    } catch (RuntimeException error) { finishFlow(false, "Your PIN could not be saved. Existing protection stays on."); }
                    finally { Arrays.fill(salt, (byte) 0); Arrays.fill(derived, (byte) 0); }
                });
            } catch (Exception error) {
                Arrays.fill(salt, (byte) 0);
                if (verifier != null) Arrays.fill(verifier, (byte) 0);
                runOnUiThread(() -> { if (request == flowId && promptActive) finishFlow(false, "PIN protection is unavailable. Existing protection stays on."); });
            } finally { Arrays.fill(entered, '\0'); }
        });
    }

    private void verifyPin(char[] entered) {
        setHashing();
        long request = flowId;
        pinWorker.execute(() -> {
            try {
                boolean accepted = pinStore.verify(entered);
                runOnUiThread(() -> {
                    if (request != flowId || !promptActive) return;
                    if (!accepted) {
                        hashing = false;
                        pinInput.setEnabled(true);
                        submitButton.setEnabled(true);
                        pinHint.setText("That PIN does not match. Your journal stays locked.");
                        showCooldown();
                    } else if ("change".equals(pendingAction)) showPinDialog("new");
                    else {
                        try {
                            if ("disable".equals(pendingAction)) pinStore.disable();
                            finishFlow(true, null);
                        } catch (RuntimeException error) { finishFlow(false, "App lock could not be disabled. It remains enabled."); }
                    }
                });
            } catch (Exception error) {
                runOnUiThread(() -> { if (request == flowId && promptActive) finishFlow(false, "PIN protection could not be checked. Your journal stays locked."); });
            } finally { Arrays.fill(entered, '\0'); }
        });
    }

    private void clearProposedPin() {
        if (proposedPin != null) Arrays.fill(proposedPin, '\0');
        proposedPin = null;
    }

    private void finishFlow(boolean confirmed, String error) {
        AuthenticationResult callback = pendingResult;
        pendingResult = null;
        pendingAction = null;
        promptActive = false;
        legacyPromptActive = false;
        hashing = false;
        flowId++;
        clearProposedPin();
        if (pinInput != null) pinInput.setText("");
        AlertDialog oldDialog = pinDialog;
        pinDialog = null;
        pinInput = null;
        pinHint = null;
        submitButton = null;
        if (oldDialog != null) oldDialog.dismiss();
        authenticated = confirmed || !pinStore.enabled();
        updateShield();
        if (!confirmed && pinStore.enabled() && shieldMessage != null) shieldMessage.setText(error == null ? "Your journal stays locked. Enter your TULLIP PIN when you are ready." : error);
        notifyLockState();
        if (callback != null) callback.complete(confirmed, error);
    }

    private void createShield() {
        shield = new FrameLayout(this);
        shield.setBackgroundColor(Color.rgb(255, 244, 216));
        shield.setClickable(true);
        shield.setFocusable(true);
        shield.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        shield.setVisibility(View.GONE);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        content.setPadding(dp(28), dp(28), dp(28), dp(28));
        TextView title = new TextView(this);
        title.setText("✦ TULLIP ✦\nA little space, just for you.");
        title.setTextColor(PLUM);
        title.setTextSize(27);
        title.setTypeface(Typeface.SERIF);
        title.setGravity(Gravity.CENTER);
        if (Build.VERSION.SDK_INT >= 28) title.setAccessibilityHeading(true);
        content.addView(title);
        shieldMessage = new TextView(this);
        shieldMessage.setTextColor(PLUM);
        shieldMessage.setTextSize(16);
        shieldMessage.setPadding(0, dp(28), 0, dp(28));
        shieldMessage.setGravity(Gravity.CENTER);
        content.addView(shieldMessage);
        unlockButton = new Button(this);
        unlockButton.setText("Unlock with TULLIP PIN");
        unlockButton.setAllCaps(false);
        unlockButton.setTextColor(PLUM);
        unlockButton.setBackgroundTintList(ColorStateList.valueOf(LAVENDER));
        unlockButton.setMinHeight(dp(52));
        unlockButton.setOnClickListener(view -> requestCredential("unlock", (success, error) -> { if (error != null) shieldMessage.setText(error); }));
        content.addView(unlockButton);
        shield.addView(content, new FrameLayout.LayoutParams(-1, -1));
        addContentView(shield, new FrameLayout.LayoutParams(-1, -1));
    }

    private void showShield() {
        if (shield == null) return;
        shieldMessage.setText(pinStore.legacy() ? "Your existing lock is still protecting this journal. Verify it once to create your own TULLIP PIN." : "Your money, wishes, and records are tucked away behind your own six-digit TULLIP PIN.");
        unlockButton.setText(pinStore.legacy() ? "Upgrade protected app lock" : "Unlock with TULLIP PIN");
        unlockButton.setEnabled(!promptActive);
        shield.setVisibility(View.VISIBLE);
        shield.bringToFront();
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setVisibility(View.INVISIBLE);
            bridge.getWebView().setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        }
    }

    private void updateShield() {
        if ((pinStore.enabled() && !authenticated) || promptActive) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            showShield();
        } else {
            if (shield != null) shield.setVisibility(View.GONE);
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().setVisibility(View.VISIBLE);
                bridge.getWebView().setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
            }
            if (!pinStore.enabled()) getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
    }

    @Override
    public void onPause() {
        if (pinStore != null && (pinStore.enabled() || promptActive)) {
            authenticated = false;
            if (pinDialog != null) finishFlow(false, null);
            showShield();
            notifyLockState();
        }
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyPaperSystemBars();
        if (pinStore != null) { updateShield(); notifyLockState(); }
    }

    @Override
    public void onDestroy() {
        if (pendingResult != null) finishFlow(false, null);
        clearProposedPin();
        pinWorker.shutdown();
        super.onDestroy();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private GradientDrawable rounded(int color, int radius) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(radius);
        return shape;
    }
}
