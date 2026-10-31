package com.tullip.journal;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Native TULLIP PIN dialogs; raw PINs never pass through the JavaScript bridge. */
@CapacitorPlugin(name = "AppLock")
public class AppLockPlugin extends Plugin {
    @Override
    public void load() {
        ((MainActivity) getActivity()).setLockPlugin(this);
    }

    void publishStatus(JSObject status) {
        notifyListeners("lockStateChanged", status);
    }

    @PluginMethod
    public void status(PluginCall call) {
        getActivity().runOnUiThread(() -> call.resolve(((MainActivity) getActivity()).lockStatus()));
    }

    @PluginMethod
    public void enable(PluginCall call) {
        authenticateAction("enable", call);
    }

    @PluginMethod
    public void disable(PluginCall call) {
        authenticateAction("disable", call);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        authenticateAction("unlock", call);
    }

    @PluginMethod
    public void lock(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            MainActivity activity = (MainActivity) getActivity();
            activity.lockJournal();
            call.resolve(activity.lockStatus());
        });
    }

    @PluginMethod
    public void change(PluginCall call) {
        authenticateAction("change", call);
    }

    private void authenticateAction(String action, PluginCall call) {
        getActivity().runOnUiThread(() -> {
            MainActivity activity = (MainActivity) getActivity();
            activity.requestCredential(action, (confirmed, error) -> {
                if (error != null) {
                    call.reject(error);
                } else {
                    JSObject status = activity.lockStatus();
                    status.put("authenticated", confirmed);
                    call.resolve(status);
                }
            });
        });
    }
}

