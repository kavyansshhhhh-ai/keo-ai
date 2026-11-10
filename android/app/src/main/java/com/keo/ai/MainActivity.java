package com.keo.ai;

import android.Manifest;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private PermissionRequest pendingPermissionRequest;
    private static final int PERMISSION_REQUEST_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        registerPlugin(KeoNativePlugin.class);
        super.onCreate(savedInstanceState);

        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> handleWebViewPermissionRequest(request));
                }
            });
        }
    }

    private void handleWebViewPermissionRequest(PermissionRequest request) {
        if (request == null) return;

        Uri originUri = request.getOrigin();
        String scheme = originUri != null ? originUri.getScheme() : "";
        String host = originUri != null ? originUri.getHost() : "";

        // Validate trusted app origin (Capacitor local origins: localhost, capacitor://, file://)
        boolean isTrustedOrigin = "localhost".equalsIgnoreCase(host) ||
                "capacitor".equalsIgnoreCase(scheme) ||
                "file".equalsIgnoreCase(scheme) ||
                (originUri != null && originUri.toString().startsWith("http://localhost")) ||
                (originUri != null && originUri.toString().startsWith("https://localhost"));

        if (!isTrustedOrigin) {
            // Deny permission requests from untrusted external origins
            request.deny();
            return;
        }

        // Identify requested Android system permissions
        List<String> neededPermissions = new ArrayList<>();
        for (String res : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) {
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    neededPermissions.add(Manifest.permission.RECORD_AUDIO);
                }
            }
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) {
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    neededPermissions.add(Manifest.permission.CAMERA);
                }
            }
        }

        if (neededPermissions.isEmpty()) {
            // All Android runtime permissions are granted for this trusted origin
            try {
                request.grant(request.getResources());
            } catch (Exception e) {
                request.deny();
            }
        } else {
            // Store pending request and trigger Android OS permission dialog
            pendingPermissionRequest = request;
            ActivityCompat.requestPermissions(
                MainActivity.this,
                neededPermissions.toArray(new String[0]),
                PERMISSION_REQUEST_CODE
            );
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE && pendingPermissionRequest != null) {
            boolean allGranted = true;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            if (allGranted) {
                try {
                    pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
                } catch (Exception e) {
                    pendingPermissionRequest.deny();
                }
            } else {
                pendingPermissionRequest.deny();
            }
            pendingPermissionRequest = null;
        }
    }
}
