package dev.aitsys.go

import android.content.Context
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability

internal class InAppUpdateController(
    context: Context,
    private val updateLauncher: ActivityResultLauncher<IntentSenderRequest>,
    private val onFlexibleUpdateReady: () -> Unit,
) {
    private val manager: AppUpdateManager = AppUpdateManagerFactory.create(context)
    private var registered = false
    private var updateFlowRequested = false
    private val installStateListener =
        InstallStateUpdatedListener { state ->
            if (state.installStatus() == InstallStatus.DOWNLOADED) onFlexibleUpdateReady()
        }

    fun register() {
        if (registered) return
        manager.registerListener(installStateListener)
        registered = true
    }

    fun unregister() {
        if (!registered) return
        manager.unregisterListener(installStateListener)
        registered = false
    }

    fun checkForUpdate() {
        manager.appUpdateInfo.addOnSuccessListener(::handleUpdateInfo)
    }

    fun completeFlexibleUpdate() {
        manager.completeUpdate()
    }

    private fun handleUpdateInfo(info: AppUpdateInfo) {
        if (info.installStatus() == InstallStatus.DOWNLOADED) {
            onFlexibleUpdateReady()
            return
        }
        if (
            info.installStatus() == InstallStatus.PENDING ||
            info.installStatus() == InstallStatus.DOWNLOADING ||
            info.installStatus() == InstallStatus.INSTALLING
        ) {
            updateFlowRequested = true
            return
        }

        if (info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
            if (info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)) startUpdate(info, AppUpdateType.IMMEDIATE, force = true)
            return
        }

        if (updateFlowRequested || info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE) return

        val updateType =
            when {
                info.updatePriority() >= HIGH_PRIORITY && info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE) -> AppUpdateType.IMMEDIATE
                info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE) -> AppUpdateType.FLEXIBLE
                else -> return
            }
        startUpdate(info, updateType)
    }

    private fun startUpdate(
        info: AppUpdateInfo,
        updateType: Int,
        force: Boolean = false,
    ) {
        if (updateFlowRequested && !force) return
        val started =
            manager.startUpdateFlowForResult(
                info,
                updateLauncher,
                AppUpdateOptions.newBuilder(updateType).build(),
            )
        if (started) updateFlowRequested = true
    }

    private companion object {
        const val HIGH_PRIORITY = 4
    }
}
