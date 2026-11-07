package com.keo.ai;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.os.Bundle;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class KeoAccessibilityService extends AccessibilityService {

    private static KeoAccessibilityService sInstance;
    private String currentPackageName = "";

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        sInstance = this;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        CharSequence pkg = event.getPackageName();
        if (pkg != null) {
            currentPackageName = pkg.toString();
        }
    }

    @Override
    public void onInterrupt() {
        // Required method override
    }

    @Override
    public boolean onUnbind(android.content.Intent intent) {
        sInstance = null;
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        sInstance = null;
        super.onDestroy();
    }

    public static KeoAccessibilityService getInstance() {
        return sInstance;
    }

    public static boolean isServiceRunning() {
        return sInstance != null;
    }

    public String getCurrentPackageName() {
        return currentPackageName;
    }

    /**
     * Recursively searches the active window node hierarchy for a node matching the target text or description.
     */
    public AccessibilityNodeInfo findNodeByQuery(String query, boolean clickableOnly) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || query == null || query.trim().isEmpty()) return null;
        String needle = query.toLowerCase(Locale.ROOT).trim();
        return searchNodeRecursive(root, needle, clickableOnly);
    }

    private AccessibilityNodeInfo searchNodeRecursive(AccessibilityNodeInfo node, String needle, boolean clickableOnly) {
        if (node == null) return null;

        // Privacy check: Never read or interact with password fields
        if (node.isPassword()) {
            return null;
        }

        CharSequence textSeq = node.getText();
        CharSequence descSeq = node.getContentDescription();
        String text = textSeq != null ? textSeq.toString().toLowerCase(Locale.ROOT) : "";
        String desc = descSeq != null ? descSeq.toString().toLowerCase(Locale.ROOT) : "";

        boolean matches = text.contains(needle) || desc.contains(needle);
        if (matches) {
            if (!clickableOnly || isClickableOrHasClickableParent(node)) {
                return node;
            }
        }

        int childCount = node.getChildCount();
        for (int i = 0; i < childCount; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            AccessibilityNodeInfo match = searchNodeRecursive(child, needle, clickableOnly);
            if (match != null) return match;
        }

        return null;
    }

    /**
     * Finds the primary editable input text node in the active window.
     */
    public AccessibilityNodeInfo findInputNode() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return null;
        return searchInputNodeRecursive(root);
    }

    private AccessibilityNodeInfo searchInputNodeRecursive(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (node.isPassword()) return null;

        if (node.isEditable() || (node.getClassName() != null && node.getClassName().toString().contains("EditText"))) {
            return node;
        }

        int childCount = node.getChildCount();
        for (int i = 0; i < childCount; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            AccessibilityNodeInfo match = searchInputNodeRecursive(child);
            if (match != null) return match;
        }
        return null;
    }

    public boolean performClickNode(AccessibilityNodeInfo targetNode) {
        if (targetNode == null) return false;
        AccessibilityNodeInfo node = targetNode;
        while (node != null) {
            if (node.isClickable()) {
                return node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
            }
            node = node.getParent();
        }
        return false;
    }

    public boolean setTextOnNode(AccessibilityNodeInfo node, String text) {
        if (node == null || text == null) return false;
        if (node.isPassword()) return false;

        node.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
        Bundle arguments = new Bundle();
        arguments.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments);
    }

    public boolean performGlobalBack() {
        return performGlobalAction(GLOBAL_ACTION_BACK);
    }

    public List<String> readVisibleTextList() {
        List<String> results = new ArrayList<>();
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root != null) {
            collectTextRecursive(root, results);
        }
        return results;
    }

    private void collectTextRecursive(AccessibilityNodeInfo node, List<String> list) {
        if (node == null) return;
        if (node.isPassword()) return; // Privacy protection

        CharSequence textSeq = node.getText();
        if (textSeq != null && textSeq.length() > 0) {
            String text = textSeq.toString().trim();
            if (!text.isEmpty() && !list.contains(text)) {
                list.add(text);
            }
        }
        CharSequence descSeq = node.getContentDescription();
        if (descSeq != null && descSeq.length() > 0) {
            String desc = descSeq.toString().trim();
            if (!desc.isEmpty() && !list.contains(desc)) {
                list.add(desc);
            }
        }

        int childCount = node.getChildCount();
        for (int i = 0; i < childCount; i++) {
            collectTextRecursive(node.getChild(i), list);
        }
    }

    public boolean performScrollNode(AccessibilityNodeInfo targetNode, boolean forward) {
        if (targetNode == null) return false;
        int action = forward ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD;
        AccessibilityNodeInfo node = targetNode;
        while (node != null) {
            if ((node.getActions() & action) != 0) {
                return node.performAction(action);
            }
            node = node.getParent();
        }
        return false;
    }

    private boolean isClickableOrHasClickableParent(AccessibilityNodeInfo targetNode) {
        AccessibilityNodeInfo node = targetNode;
        while (node != null) {
            if (node.isClickable()) return true;
            node = node.getParent();
        }
        return false;
    }
}
