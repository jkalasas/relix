package com.relix.keepalive

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class KeepaliveService : Service() {
    companion object {
        const val CHANNEL_ID = "relix_session_keepalive"
        const val CHANNEL_NAME = "Session keepalive"
        const val NOTIFICATION_ID = 7101
        const val EXTRA_LABEL = "label"
        const val ACTION_START = "com.relix.keepalive.START"
        const val ACTION_STOP = "com.relix.keepalive.STOP"
        const val ACTION_KILL = "com.relix.keepalive.KILL"

        @Volatile
        var isRunning: Boolean = false
            private set
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_KILL -> {
                KeepalivePlugin.emitKilled()
                stopKeepalive()
                return START_NOT_STICKY
            }
            ACTION_STOP -> {
                stopKeepalive()
                return START_NOT_STICKY
            }
            else -> {
                val label =
                    intent?.getStringExtra(EXTRA_LABEL)
                        ?: "Relix is running · sessions active"
                startAsForeground(label)
                isRunning = true
                return START_STICKY
            }
        }
    }

    override fun onDestroy() {
        isRunning = false
        super.onDestroy()
    }

    private fun startAsForeground(label: String) {
        ensureChannel()
        val notification = buildNotification(label)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun stopKeepalive() {
        isRunning = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel =
            NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Shown while Relix holds live SSH sessions"
                setShowBadge(false)
            }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(label: String): Notification {
        val launchIntent =
            packageManager.getLaunchIntentForPackage(packageName)?.let { intent ->
                PendingIntent.getActivity(
                    this,
                    0,
                    intent,
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                )
            }

        val killIntent =
            Intent(this, KeepaliveService::class.java).apply {
                action = ACTION_KILL
            }
        val killPending =
            PendingIntent.getService(
                this,
                1,
                killIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )

        val title = packageManager.getApplicationLabel(applicationInfo).toString().ifBlank { "Relix" }
        val icon =
            if (applicationInfo.icon != 0) applicationInfo.icon
            else android.R.drawable.ic_dialog_info

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(label)
            .setSmallIcon(icon)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(launchIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .addAction(0, "Kill", killPending)
            .build()
    }
}
