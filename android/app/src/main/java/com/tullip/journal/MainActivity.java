package com.tullip.journal;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

/** Native shield is applied independently of JavaScript and covers every background transition. */
public class MainActivity extends BridgeActivity {
    private static final String LOCK_PREFERENCES = "tullip_privacy";
    private static final String ENABLED = "device_credential_lock_enabled";
    private boolean lockEnabled;
    private boolean authenticated;
    private boolean promptActive;
    private String pendingAction;
    private AuthenticationResult pendingResult;
    private FrameLayout shield;
    private TextView shieldMessage;
    private Button unlockButton;
    private AppLockPlugin lockPlugin;

    interface AuthenticationResult {
        void complete(boolean authenticated, String error);
    }

    private final ActivityResultLauncher<Intent> credentialLauncher = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(), result -> {
            boolean confirmed = result.getResultCode() == Activity.RESULT_OK;
            String action = pendingAction;
            AuthenticationResult callback = pendingResult;
            pendingResult = null;
            pendingAction = null;
            promptActive = false;
            String error = null;

            if (confirmed) {
                if ("enable".equals(action) || "disable".equals(action)) {
                    boolean nextEnabled = "enable".equals(action);
                    // Commit before exposing the journal so a restarted process cannot bypass setup.
                    if (privacyPreferences().edit().putBoolean(ENABLED, nextEnabled).commit()) {
                        lockEnabled = nextEnabled;
                    } else {
                        confirmed = false;
                        error = "Could not save app-lock preferences. Try again.";
                    }
                }
            }
            authenticated = confirmed || !lockEnabled;
            updateShield();
            if (!confirmed && lockEnabled && shieldMessage != null) {
                shieldMessage.setText(error == null
                    ? "Authentication was cancelled or not completed. Your journal stays locked."
                    : error);
            }
            notifyLockState();
            if (callback != null) callback.complete(confirmed, error);
        }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        lockEnabled = privacyPreferences().getBoolean(ENABLED, false);
        authenticated = !lockEnabled;
        if (lockEnabled) getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        registerPlugin(AppLockPlugin.class);
        super.onCreate(savedInstanceState);
        applyPaperSystemBars();
        createShield();
        updateShield();
    }

    @SuppressWarnings("deprecation") // Bar colors remain necessary on API 24-34; edge-to-edge controls API 35+.
    private void applyPaperSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(true);
        controller.setAppearanceLightNavigationBars(Build.VERSION.SDK_INT >= 26);
        if (Build.VERSION.SDK_INT < 35) {
            int paper = Color.rgb(255, 253, 251);
            getWindow().setStatusBarColor(paper);
            // API 24-25 cannot draw dark navigation icons, so retain a contrasting plum bar.
            getWindow().setNavigationBarColor(Build.VERSION.SDK_INT >= 26 ? paper : Color.rgb(81, 35, 111));
        }
    }

    private SharedPreferences privacyPreferences() {
        return getSharedPreferences(LOCK_PREFERENCES, Context.MODE_PRIVATE);
    }

    private KeyguardManager keyguard() {
        return (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
    }

    boolean canAuthenticate() {
        KeyguardManager keyguard = keyguard();
        return keyguard != null && keyguard.isDeviceSecure();
    }

    JSObject lockStatus() {
        JSObject status = new JSObject();
        status.put("supported", true);
        status.put("available", canAuthenticate());
        status.put("enabled", lockEnabled);
        status.put("locked", lockEnabled && !authenticated);
        status.put("method", "device_credential");
        return status;
    }

    void setLockPlugin(AppLockPlugin plugin) {
        lockPlugin = plugin;
    }

    private void notifyLockState() {
        if (lockPlugin != null) lockPlugin.publishStatus(lockStatus());
    }

    void lockJournal() {
        if (lockEnabled) {
            authenticated = false;
            updateShield();
            notifyLockState();
        }
    }

    @SuppressWarnings("deprecation") // Supported on the application's API 24 minimum without another permission.
    void requestCredential(String action, AuthenticationResult callback) {
        if (promptActive) {
            callback.complete(false, "An authentication request is already open.");
            return;
        }
        if (!canAuthenticate()) {
            callback.complete(false, "Set a screen-lock PIN, pattern, or password in Android Settings first. If a previously configured device credential was removed, the journal remains locked; restore device security before trying again.");
            return;
        }
        if (("unlock".equals(action) || "disable".equals(action)) && !lockEnabled) {
            callback.complete(true, null);
            return;
        }
        Intent intent = keyguard().createConfirmDeviceCredentialIntent(
            "Unlock TULLIP", "Confirm your Android screen lock to continue."
        );
        if (intent == null) {
            callback.complete(false, "Android could not open device authentication.");
            return;
        }
        promptActive = true;
        pendingAction = action;
        pendingResult = callback;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        showShield();
        try {
            credentialLauncher.launch(intent);
        } catch (RuntimeException error) {
            promptActive = false;
            pendingResult = null;
            pendingAction = null;
            updateShield();
            callback.complete(false, "Android device authentication is unavailable.");
        }
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
        int padding = Math.round(28 * getResources().getDisplayMetrics().density);
        content.setPadding(padding, padding, padding, padding);
        TextView title = new TextView(this);
        title.setText("TULLIP\nYour private journal");
        title.setTextColor(Color.rgb(81, 35, 111));
        title.setTextSize(27);
        title.setGravity(Gravity.CENTER);
        if (android.os.Build.VERSION.SDK_INT >= 28) title.setAccessibilityHeading(true);
        content.addView(title);
        shieldMessage = new TextView(this);
        shieldMessage.setTextColor(Color.rgb(81, 35, 111));
        shieldMessage.setTextSize(16);
        shieldMessage.setPadding(0, padding, 0, padding);
        shieldMessage.setGravity(Gravity.CENTER);
        content.addView(shieldMessage);
        unlockButton = new Button(this);
        unlockButton.setText("Unlock with Android screen lock");
        unlockButton.setAllCaps(false);
        unlockButton.setOnClickListener(view -> requestCredential("unlock", (success, error) -> {
            if (error != null) shieldMessage.setText(error);
        }));
        content.addView(unlockButton);
        shield.addView(content, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT
        ));
        addContentView(shield, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT
        ));
    }

    private void showShield() {
        if (shield == null) return;
        shieldMessage.setText("Your money, wishes, and records stay hidden until you authenticate.");
        unlockButton.setEnabled(!promptActive);
        shield.setVisibility(View.VISIBLE);
        shield.bringToFront();
        // A native cover also excludes underlying WebView content from accessibility services.
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setVisibility(View.INVISIBLE);
            bridge.getWebView().setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        }
    }

    private void updateShield() {
        if ((lockEnabled && !authenticated) || promptActive) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            showShield();
        } else {
            if (shield != null) shield.setVisibility(View.GONE);
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().setVisibility(View.VISIBLE);
                bridge.getWebView().setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
            }
            if (!lockEnabled) getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
    }

    @Override
    public void onPause() {
        if (lockEnabled || promptActive) {
            authenticated = false;
            showShield();
            notifyLockState();
        }
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyPaperSystemBars();
        updateShield();
        notifyLockState();
    }
}
