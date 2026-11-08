package com.keo.ai;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.accessibility.AccessibilityNodeInfo;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.List;

@CapacitorPlugin(
    name = "KeoNative",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone"),
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class KeoNativePlugin extends Plugin {

    private static final String MICROPHONE = "microphone";
    private static final String CAMERA = "camera";
    private static final String NOTIFICATIONS = "notifications";
    private static final String ACCESSIBILITY = "accessibility";

    @PluginMethod
    public void getInstalledApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent mainIntent = new Intent(Intent.ACTION_MAIN, null);
        mainIntent.addCategory(Intent.CATEGORY_LAUNCHER);

        List<ResolveInfo> launchables = pm.queryIntentActivities(mainIntent, 0);
        JSArray appsList = new JSArray();

        for (ResolveInfo info : launchables) {
            if (info.activityInfo == null || info.activityInfo.packageName == null) continue;
            String pkg = info.activityInfo.packageName;
            CharSequence labelSeq = info.loadLabel(pm);
            String label = labelSeq != null ? labelSeq.toString() : pkg;

            JSObject appObj = new JSObject();
            appObj.put("packageName", pkg);
            appObj.put("appName", label);
            appsList.put(appObj);
        }

        JSObject ret = new JSObject();
        ret.put("apps", appsList);
        call.resolve(ret);
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        String packageName = call.getString("packageName");
        if (packageName == null || packageName.isEmpty()) {
            call.reject("No app package was provided.");
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
        try {
            getContext().startActivity(launch);
            result.put("status", "opened");
            call.resolve(result);
        } catch (ActivityNotFoundException err) {
            result.put("status", "missing");
            call.resolve(result);
        }
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        Uri uri = url == null ? null : Uri.parse(url);
        String scheme = uri == null ? null : uri.getScheme();
        if (scheme == null || !(scheme.equals("https") || scheme.equals("mailto") || scheme.equals("http"))) {
            call.reject("Only web and email links can be opened.");
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
            case "accessibility":
                intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                break;
            case "notifications":
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
                } else {
                    intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.fromParts("package", getContext().getPackageName(), null));
                }
                break;
            case "wifi":
                intent = new Intent(Settings.ACTION_WIFI_SETTINGS);
                break;
            case "bluetooth":
                intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                break;
            case "location":
                intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                break;
            case "sound":
                intent = new Intent(Settings.ACTION_SOUND_SETTINGS);
                break;
            case "settings":
                intent = new Intent(Settings.ACTION_SETTINGS);
                break;
            case "camera":
                intent = new Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA);
                break;
            case "gallery":
                intent = new Intent(Intent.ACTION_VIEW, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
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
    public void getBatteryStatus(PluginCall call) {
        IntentFilter ifilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
        Intent batteryStatus = getContext().registerReceiver(null, ifilter);
        JSObject result = new JSObject();
        if (batteryStatus != null) {
            int level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            int status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1);

            float batteryPct = (level / (float) scale) * 100;
            boolean isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                                 status == BatteryManager.BATTERY_STATUS_FULL;

            result.put("level", Math.round(batteryPct));
            result.put("charging", isCharging);
            result.put("available", true);
        } else {
            result.put("available", false);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void isAccessibilityEnabled(PluginCall call) {
        boolean running = KeoAccessibilityService.isServiceRunning();
        boolean enabledInSettings = isAccessibilityServiceEnabledInSettings();
        JSObject result = new JSObject();
        result.put("enabled", running || enabledInSettings);
        result.put("running", running);
        result.put("enabledInSettings", enabledInSettings);
        call.resolve(result);
    }

    private boolean isAccessibilityServiceEnabledInSettings() {
        Context context = getContext();
        String expectedService = context.getPackageName() + "/" + KeoAccessibilityService.class.getCanonicalName();
        String enabledServices = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabledServices != null) {
            String[] services = enabledServices.split(":");
            for (String service : services) {
                if (service.equalsIgnoreCase(expectedService) || service.equalsIgnoreCase(context.getPackageName() + "/." + KeoAccessibilityService.class.getSimpleName())) {
                    return true;
                }
            }
        }
        return false;
    }

    @PluginMethod
    public void performAccessibilityAction(PluginCall call) {
        String action = call.getString("action");
        if (!KeoAccessibilityService.isServiceRunning()) {
            call.reject("Keo Accessibility Service is not enabled. Please enable it in Settings.");
            return;
        }
        KeoAccessibilityService service = KeoAccessibilityService.getInstance();
        JSObject result = new JSObject();

        if ("findAndClick".equals(action)) {
            String query = call.getString("query");
            AccessibilityNodeInfo node = service.findNodeByQuery(query, true);
            if (node != null) {
                boolean clicked = service.performClickNode(node);
                result.put("success", clicked);
                result.put("detail", clicked ? "Clicked target node" : "Could not click node");
            } else {
                result.put("success", false);
                result.put("detail", "Target UI element not found");
            }
            call.resolve(result);
            return;
        }

        if ("findAndType".equals(action)) {
            String text = call.getString("text");
            AccessibilityNodeInfo inputNode = service.findInputNode();
            if (inputNode != null) {
                boolean typed = service.setTextOnNode(inputNode, text);
                result.put("success", typed);
                result.put("detail", typed ? "Entered text in input field" : "Could not set text");
            } else {
                result.put("success", false);
                result.put("detail", "No editable input field found");
            }
            call.resolve(result);
            return;
        }

        if ("scrollForward".equals(action) || "scrollBackward".equals(action)) {
            boolean forward = "scrollForward".equals(action);
            AccessibilityNodeInfo root = service.getRootInActiveWindow();
            boolean scrolled = service.performScrollNode(root, forward);
            result.put("success", scrolled);
            result.put("detail", scrolled ? (forward ? "Scrolled forward" : "Scrolled backward") : "Could not scroll current page");
            call.resolve(result);
            return;
        }

        if ("navigateBack".equals(action)) {
            boolean done = service.performGlobalBack();
            result.put("success", done);
            call.resolve(result);
            return;
        }

        if ("readScreenText".equals(action)) {
            List<String> textList = service.readVisibleTextList();
            JSArray array = new JSArray();
            for (String t : textList) array.put(t);
            result.put("textList", array);
            result.put("success", true);
            call.resolve(result);
            return;
        }

        if ("sendWhatsAppMessage".equals(action)) {
            // Confirm & tap send button in WhatsApp
            AccessibilityNodeInfo sendBtn = service.findNodeByQuery("Send", true);
            if (sendBtn == null) {
                sendBtn = service.findNodeByQuery("send", true);
            }
            if (sendBtn != null) {
                boolean clicked = service.performClickNode(sendBtn);
                result.put("success", clicked);
                result.put("detail", clicked ? "Message sent" : "Could not tap send button");
            } else {
                result.put("success", false);
                result.put("detail", "WhatsApp send button not found on screen");
            }
            call.resolve(result);
            return;
        }

        call.reject("Unsupported accessibility action.");
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        String permission = call.getString("permission");
        if (ACCESSIBILITY.equals(permission)) {
            JSObject res = new JSObject();
            boolean running = KeoAccessibilityService.isServiceRunning();
            boolean enabledInSettings = isAccessibilityServiceEnabledInSettings();
            res.put("state", (running || enabledInSettings) ? "granted" : "denied");
            call.resolve(res);
            return;
        }

        String alias = mapAlias(permission);
        if (alias == null) {
            call.reject("Unsupported permission.");
            return;
        }

        if (NOTIFICATIONS.equals(permission) && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject res = new JSObject();
            res.put("state", "granted");
            call.resolve(res);
            return;
        }

        call.resolve(stateObject(alias));
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        String permission = call.getString("permission");
        String alias = mapAlias(permission);
        if (alias == null) {
            call.reject("Unsupported permission.");
            return;
        }

        if (NOTIFICATIONS.equals(permission) && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject res = new JSObject();
            res.put("state", "granted");
            call.resolve(res);
            return;
        }

        if (getPermissionState(alias) == PermissionState.GRANTED) {
            call.resolve(stateObject(alias));
            return;
        }

        requestPermissionForAlias(alias, call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        String permission = call.getString("permission");
        String alias = mapAlias(permission);
        if (alias != null) {
            call.resolve(stateObject(alias));
        } else {
            call.reject("Permission request completed with unknown alias.");
        }
    }

    private String mapAlias(String permission) {
        if ("microphone".equals(permission)) return MICROPHONE;
        if ("camera".equals(permission)) return CAMERA;
        if ("notifications".equals(permission)) return NOTIFICATIONS;
        return null;
    }

    private JSObject stateObject(String alias) {
        JSObject result = new JSObject();
        PermissionState state = getPermissionState(alias);
        result.put("state", state.name().toLowerCase().replace('_', '-'));
        return result;
    }
}
