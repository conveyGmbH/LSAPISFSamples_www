# Fix: Display Name Not Showing in Sidebar

## 🐛 Problem

User reported: "En ce moment le displayname ne marche pas"

### Symptoms
- User info (display name, email, organization) not appearing in sidebar after successful OAuth
- 401 errors on `/api/salesforce/check` before OAuth connection established
- Server logs show successful OAuth with correct user info: `display_name: 'Maxim Kemajou'`
- Console shows "Connection status: connected - Connected as Maxim Kemajou"

## 🔍 Root Cause

**LocalStorage Key Mismatch**

The issue was a mismatch between where connection data was **saved** vs where it was **read from**:

1. **ConnectionPersistenceManager** (saves data):
   - Saves to: `localStorage.getItem('sf_user_info')`
   - Location: [displayLeadTransferController.js:27](c:\gitprojects\LSAPISFCRM\js\controllers\displayLeadTransferController.js#L27)

2. **updateUserProfileSidebar** (reads data):
   - Read from: `localStorage.getItem('sf_connection_status')`
   - Location: [displayLeadTransfer_v2_adapter.js:505](c:\gitprojects\LSAPISFCRM\js\controllers\displayLeadTransfer_v2_adapter.js#L505)

### Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│ OAuth Success → ConnectionPersistenceManager.saveConnection()    │
│                                                                   │
│   Saves to localStorage:                                         │
│   - Key: "sf_user_info"                                          │
│   - Value: { status, userInfo, orgId, connectedAt, expiresAt }  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ updateConnectionStatus() called                                   │
│   - Calls updateUserProfile() ✅                                 │
│   - Does NOT call updateUserProfileSidebar() ❌                  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ Sidebar tries to update via MutationObserver                     │
│   - Reads from: "sf_connection_status" ❌                        │
│   - Data is in: "sf_user_info" ✅                                │
│   - Result: No data found → Sidebar stays hidden                 │
└──────────────────────────────────────────────────────────────────┘
```

## ✅ Solution

### 1. Fix localStorage Key Reading

**File**: [displayLeadTransfer_v2_adapter.js](c:\gitprojects\LSAPISFCRM\js\controllers\displayLeadTransfer_v2_adapter.js)

Updated `updateUserProfileSidebar()` to check **both** localStorage keys:

```javascript
function updateUserProfileSidebar() {
    // ... DOM element checks ...

    let userInfo = null;

    try {
        // ✅ First try sf_user_info (used by ConnectionPersistenceManager)
        const userInfoData = JSON.parse(localStorage.getItem('sf_user_info'));
        if (userInfoData && userInfoData.userInfo) {
            userInfo = userInfoData.userInfo;
        }

        // ✅ Fallback to sf_connection_status (legacy)
        if (!userInfo) {
            const persistedConnection = JSON.parse(localStorage.getItem('sf_connection_status'));
            if (persistedConnection && persistedConnection.userInfo) {
                userInfo = persistedConnection.userInfo;
            }
        }
    } catch (e) {
        console.warn('Failed to load user info from localStorage:', e);
    }

    if (userInfo) {
        sidebarProfile.style.display = 'block';
        userName.textContent = userInfo.display_name || userInfo.username || 'User';
        userEmail.textContent = userInfo.username || '-';
        userOrg.textContent = userInfo.organization_name || 'Unknown Org';

        // Create avatar initials
        const initials = (userInfo.display_name || userInfo.username || 'U')
            .split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);
        userAvatar.textContent = initials;

        console.log('✅ Sidebar profile updated:', userInfo.display_name || userInfo.username);
    } else {
        sidebarProfile.style.display = 'none';
        console.log('ℹ️ No user info available for sidebar');
    }
}
```

### 2. Fix updateAPIStatus

**File**: [displayLeadTransfer_v2_adapter.js](c:\gitprojects\LSAPISFCRM\js\controllers\displayLeadTransfer_v2_adapter.js)

Updated `updateAPIStatus()` to check **both** localStorage keys:

```javascript
function updateAPIStatus() {
    const statusCard = document.getElementById('api-status-card');
    if (!statusCard) return;

    try {
        let persistedConnection = null;

        // ✅ First try sf_user_info (used by ConnectionPersistenceManager)
        const userInfoData = localStorage.getItem('sf_user_info');
        if (userInfoData) {
            persistedConnection = JSON.parse(userInfoData);
        }

        // ✅ Fallback to sf_connection_status (legacy)
        if (!persistedConnection) {
            const connectionStatus = localStorage.getItem('sf_connection_status');
            if (connectionStatus) {
                persistedConnection = JSON.parse(connectionStatus);
            }
        }

        const isConnected = persistedConnection &&
                          persistedConnection.status === 'connected' &&
                          persistedConnection.expiresAt > Date.now();

        if (isConnected) {
            const displayName = persistedConnection.userInfo?.display_name ||
                              persistedConnection.userInfo?.username ||
                              persistedConnection.orgId || 'default';

            statusCard.innerHTML = `
                <div class="flex items-center">
                    <div class="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                    <span class="text-sm font-medium text-green-700">API Connected</span>
                </div>
                <p class="text-xs text-green-600 mt-1">${displayName}</p>
            `;
        } else {
            // ... disconnected UI ...
        }
    } catch (e) {
        console.warn('Failed to update API status:', e);
    }
}
```

### 3. Trigger Updates After Connection

**File**: [displayLeadTransferController.js](c:\gitprojects\LSAPISFCRM\js\controllers\displayLeadTransferController.js)

Updated `updateConnectionStatus()` to explicitly call sidebar and API status updates:

```javascript
function updateConnectionStatus(status, message, userInfo = null) {
    if (status === 'connected' && userInfo) {
        // Save connection
        ConnectionPersistenceManager.saveConnection(userInfo);
        updateUserProfile(userInfo);

        // ✅ Update sidebar profile (V2 UI)
        if (typeof window.updateUserProfileSidebar === 'function') {
            window.updateUserProfileSidebar();
        }

        // ✅ Update API status indicator (V2 UI)
        if (typeof window.updateAPIStatus === 'function') {
            window.updateAPIStatus();
        }

        // ... rest of connection logic ...
    } else {
        // Clear connection
        ConnectionPersistenceManager.clearConnection();
        clearUserProfile();

        // ✅ Update sidebar profile (V2 UI)
        if (typeof window.updateUserProfileSidebar === 'function') {
            window.updateUserProfileSidebar();
        }

        // ✅ Update API status indicator (V2 UI)
        if (typeof window.updateAPIStatus === 'function') {
            window.updateAPIStatus();
        }

        // ... rest of disconnection logic ...
    }
}
```

### 4. Expose Functions Globally

**File**: [displayLeadTransfer_v2_adapter.js](c:\gitprojects\LSAPISFCRM\js\controllers\displayLeadTransfer_v2_adapter.js)

Made functions available to main controller:

```javascript
// Expose functions globally for integration with main controller
window.openEditModal = openEditModal;
window.updateUserProfileSidebar = updateUserProfileSidebar;  // ✅ Added
window.updateAPIStatus = updateAPIStatus;                    // ✅ Added
```

## 🎯 Result

### Before Fix
- ❌ Sidebar profile remains hidden after OAuth
- ❌ API status shows "Disconnected" even when connected
- ❌ User info not displayed anywhere in V2 UI

### After Fix
- ✅ Sidebar profile shows immediately after OAuth success
- ✅ Displays: Avatar initials, display name, email, organization
- ✅ API status card shows "API Connected" with user name
- ✅ Updates automatically on connection/disconnection
- ✅ Backward compatible with legacy key

## 📝 Files Modified

1. **js/controllers/displayLeadTransfer_v2_adapter.js**
   - Updated `updateUserProfileSidebar()` - lines 494-547
   - Updated `updateAPIStatus()` - lines 561-612
   - Exposed functions globally - lines 832-835

2. **js/controllers/displayLeadTransferController.js**
   - Updated `updateConnectionStatus()` - lines 4324-4383
   - Added calls to sidebar/API status updates

## 🧪 Testing

### Test 1: Fresh OAuth Connection
```javascript
// Steps:
1. Clear localStorage
2. Click "Connect to Salesforce"
3. Complete OAuth flow
4. Verify sidebar shows: display name, email, org
5. Verify API status card shows "API Connected" with name
```

### Test 2: Page Refresh with Existing Connection
```javascript
// Steps:
1. Complete OAuth (ensure connected)
2. Refresh page
3. Verify sidebar appears with user info
4. Verify API status shows connected
```

### Test 3: Disconnect
```javascript
// Steps:
1. While connected, click "Disconnect"
2. Verify sidebar hides
3. Verify API status shows "Disconnected"
4. Verify localStorage is cleared
```

## 🔄 Backward Compatibility

The fix maintains backward compatibility:

- ✅ Checks both `sf_user_info` (new) and `sf_connection_status` (legacy)
- ✅ Works with existing code that saves to either key
- ✅ Gracefully handles missing data
- ✅ Logs helpful console messages for debugging

## 📚 Related Documentation

- [OAuth Frontend Integration](./OAuth_Frontend_Integration.md)
- [OAuth Invalid State Fix](./OAuth_Invalid_State_Fix.md)
- [LeadSuccess SF System Documentation](./LeadSuccess_SF_System_Documentation.md)

---

**Version:** 1.0
**Date:** 2025-10-09
**Issue:** Display name not showing in sidebar after OAuth
**Status:** ✅ Fixed
