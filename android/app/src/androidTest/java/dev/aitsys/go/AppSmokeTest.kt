package dev.aitsys.go

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class AppSmokeTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun showsPrimaryNavigation() {
        compose.onNodeWithText("Create").assertIsDisplayed()
        compose.onNodeWithText("Manage").assertIsDisplayed()
        compose.onNodeWithText("Settings").assertIsDisplayed()
    }
}
