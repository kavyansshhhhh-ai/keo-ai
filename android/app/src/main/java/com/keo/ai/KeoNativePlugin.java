package com.keo.ai;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.provider.MediaStore;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "KeoNative",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone"),
    }
)
public class KeoNativePlugin extends Plugin {

    private static final String MICROPHONE = "microphone";

    @PluginMethod
    public void openApp(PluginCall call) {
        String packageName = call.getString("packageName");
        if (packageName == null || packageName.isEmpty()) {
            call.reject("No app was given to open.");
            return;
        }
        Intent launch = getContext().getPackageManager().getLaunchIntentForPackage(packageName);
        JSObject result = new JSObject();
        if (launch == null) {
            result.put("status", "missing");
            call.resolve(result);
            return;
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(launch);
        result.put("status", "opened");
        call.resolve(result);
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        Uri uri = url == null ? null : Uri.parse(url);
        String scheme = uri == null ? null : uri.getScheme();
        if (scheme == null || !(scheme.equals("https") || scheme.equals("mailto"))) {
            call.reject("Only secure web and email links can be opened.");
            return;
        }
        Intent view = new Intent(Intent.ACTION_VIEW, uri);
        view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(view);
            call.resolve();
        } catch (ActivityNotFoundException err) {
            call.reject("No app on this phone can open that link.");
        }
    }

    @PluginMethod
    public void openScreen(PluginCall call) {
        String screen = call.getString("screen");
        Intent intent;
        switch (screen == null ? "" : screen) {
            case "wifi":
                intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
                break;
            case "bluetooth":
                intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                break;
            case "settings":
                intent = new Intent(Settings.ACTION_SETTINGS);
                break;
            case "camera":
                intent = new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA);
                break;
            case "appDetails":
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", getContext().getPackageName(), null));
                break;
            default:
                call.reject("That screen can't be opened.");
                return;
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException err) {
            call.reject("This phone doesn't have that settings screen.");
        }
    }

    @PluginMethod
    public void setTorch(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        CameraManager manager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
        JSObject result = new JSObject();
        if (manager == null) {
            result.put("supported", false);
            call.resolve(result);
            return;
        }
        try {
            boolean any = false;
            for (String id : manager.getCameraIdList()) {
                CameraCharacteristics characteristics = manager.getCameraCharacteristics(id);
                Boolean hasFlash = characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (Boolean.TRUE.equals(hasFlash)) {
                    manager.setTorchMode(id, on);
                    any = true;
                }
            }
            result.put("supported", any);
            call.resolve(result);
        } catch (CameraAccessException err) {
            call.reject("The flashlight is busy or unavailable right now.");
        } catch (IllegalArgumentException err) {
            call.reject("The flashlight could not be changed.");
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        if (!MICROPHONE.equals(call.getString("permission"))) {
            call.reject("That permission isn't supported.");
            return;
        }
        call.resolve(stateObject());
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (!MICROPHONE.equals(call.getString("permission"))) {
            call.reject("That permission isn't supported.");
            return;
        }
        if (getPermissionState(MICROPHONE) == PermissionState.GRANTED) {
            call.resolve(stateObject());
            return;
        }
        requestPermissionForAlias(MICROPHONE, call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        call.resolve(stateObject());
    }

    private JSObject stateObject() {
        JSObject result = new JSObject();
        PermissionState state = getPermissionState(MICROPHONE);
        result.put("state", state.name().toLowerCase().replace('_', '-'));
        return result;
    }
}
