package com.relix.keepalive

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class StartKeepaliveArgs {
    var label: String = "Relix is running · sessions active"
}

@TauriPlugin(
    permissions = [
        Permission(
            strings = [Manifest.permission.POST_NOTIFICATIONS],
            alias = "notifications",
        ),
    ],
)
class KeepalivePlugin(private val activity: Activity) : Plugin(activity) {
    companion object {
        @Volatile
        private var instance: KeepalivePlugin? = null

        fun emitKilled() {
            val plugin = instance ?: return
            plugin.trigger("killed", JSObject())
        }
    }

    override fun load(webView: android.webkit.WebView) {
        instance = this
    }

    @Command
    fun startKeepalive(invoke: Invoke) {
        val args = invoke.parseArgs(StartKeepaliveArgs::class.java)
        val intent =
            Intent(activity, KeepaliveService::class.java).apply {
                action = KeepaliveService.ACTION_START
                putExtra(KeepaliveService.EXTRA_LABEL, args.label)
            }
        try {
            ContextCompat.startForegroundService(activity, intent)
            invoke.resolve()
        } catch (error: Exception) {
            invoke.reject("Failed to start keepalive: ${error.message}")
        }
    }

    @Command
    fun stopKeepalive(invoke: Invoke) {
        val intent =
            Intent(activity, KeepaliveService::class.java).apply {
                action = KeepaliveService.ACTION_STOP
            }
        try {
            activity.startService(intent)
            invoke.resolve()
        } catch (error: Exception) {
            invoke.reject("Failed to stop keepalive: ${error.message}")
        }
    }

    @Command
    fun isKeepaliveRunning(invoke: Invoke) {
        val result = JSObject()
        result.put("running", KeepaliveService.isRunning)
        invoke.resolve(result)
    }

    @Command
    fun getNotificationPermissionStatus(invoke: Invoke) {
        invoke.resolve(permissionStatusObject())
    }

    @Command
    fun requestNotificationPermission(invoke: Invoke) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            invoke.resolve(permissionStatusObject("granted"))
            return
        }
        if (hasNotificationPermission()) {
            invoke.resolve(permissionStatusObject("granted"))
            return
        }
        requestPermissionForAlias("notifications", invoke, "onNotificationPermissionResult")
    }

    @PermissionCallback
    fun onNotificationPermissionResult(invoke: Invoke) {
        invoke.resolve(permissionStatusObject())
    }

    private fun hasNotificationPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun permissionStatusObject(override: String? = null): JSObject {
        val status =
            override
                ?: if (hasNotificationPermission()) {
                    "granted"
                } else {
                    "denied"
                }
        val result = JSObject()
        result.put("status", status)
        return result
    }
}
