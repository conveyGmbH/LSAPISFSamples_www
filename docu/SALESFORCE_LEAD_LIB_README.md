# SalesforceLeadLib - Autonomous Module Documentation

**Version:** 1.0.0
**Purpose:** Self-contained Salesforce lead transfer module for LSPortal integration
**Framework Compatibility:** Standard JavaScript, WinJS

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Installation](#installation)
4. [Quick Start](#quick-start)
5. [API Reference](#api-reference)
6. [WinJS Integration](#winjs-integration)
7. [Backend Requirements](#backend-requirements)
8. [Customization](#customization)
9. [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

`SalesforceLeadLib` is an autonomous JavaScript module that provides complete Salesforce lead transfer functionality in a self-contained package. It was designed to be integrated into LSPortal (WinJS application) while maintaining compatibility with standard web applications.

### Key Characteristics

- **Autonomous**: All UI, logic, and styles contained in single file
- **No Dependencies**: No external CSS or framework requirements
- **WinJS Compatible**: Automatically returns WinJS.Promise when available
- **Backend Agnostic**: Works with existing backend APIs unchanged
- **Fully Styled**: Injects all necessary CSS automatically

---

## ✨ Features

### Core Functionality

- ✅ **Lead Display**: Renders lead data in clean, organized interface
- ✅ **Field Mapping**: Respects active field configurations per EventId
- ✅ **Transfer Validation**: Validates required fields (LastName AND Company)
- ✅ **Salesforce Transfer**: One-click transfer with progress indication
- ✅ **Status Tracking**: Real-time transfer status display
- ✅ **API Monitoring**: Live Salesforce connection status indicator

### User Interface

- ✅ **Responsive Header**: API status, user profile, disconnect button
- ✅ **Field Grid**: Organized display of active fields
- ✅ **Success Modal**: 15-second auto-close with countdown
- ✅ **Error Handling**: Detailed error modals with technical information
- ✅ **Toast Notifications**: Non-intrusive status messages
- ✅ **Loading States**: Spinners and progress indicators

### Technical Features

- ✅ **Promise Support**: Standard Promise and WinJS.Promise
- ✅ **CSS Injection**: Automatic style injection on first use
- ✅ **Event Cleanup**: Proper resource cleanup on module clear
- ✅ **API Abstraction**: Simplified backend communication layer
- ✅ **Input Validation**: Email, phone, URL format validation
- ✅ **XSS Protection**: All user input escaped

---

## 📦 Installation

### Step 1: Include the Library

```html
<script src="salesforceLeadLib.js"></script>
```

### Step 2: Prepare Container

```html
<div id="salesforceContainer"></div>
```

That's it! The module handles everything else automatically.

---

## 🚀 Quick Start

### Basic Example

```javascript
// Get container element
const container = document.getElementById('salesforceContainer');

// Prepare lead data
const leadData = {
    FirstName: 'John',
    LastName: 'Doe',
    Company: 'Acme Corporation',
    Email: 'john.doe@acme.com',
    Phone: '+1 555-0123',
    Title: 'Marketing Director',
    EventId: '12345'
};

// Configure credentials
const credentials = {
    username: 'user@company.com',
    orgId: '00D5g000000abcd',
    backendUrl: 'http://localhost:3000'
};

// Optional settings
const options = {
    title: 'Salesforce Lead Transfer',
    eventId: '12345',
    onDisconnect: () => {
        console.log('User clicked disconnect');
    },
    onDisconnected: () => {
        console.log('Module cleared');
    }
};

// Initialize module
SalesforceLeadLib.initialize(container, leadData, credentials, options)
    .then(result => {
        console.log('Module ready:', result);
    })
    .catch(error => {
        console.error('Initialization failed:', error);
    });
```

---

## 📚 API Reference

### `SalesforceLeadLib.initialize()`

Initialize the Salesforce lead module and render the interface.

**Syntax:**
```javascript
SalesforceLeadLib.initialize(container, leadData, credentials, options)
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `container` | HTMLElement | Yes | DOM element to render module into |
| `leadData` | Object | Yes | Lead data object with field values |
| `credentials` | Object | Yes | Authentication and configuration |
| `options` | Object | No | Additional configuration options |

**credentials Object:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `username` | string | Yes | User email/username |
| `orgId` | string | Yes | Salesforce organization ID |
| `backendUrl` | string | No | Backend API URL (default: http://localhost:3000) |

**options Object:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | string | No | Header title (default: "Salesforce Lead Transfer") |
| `eventId` | string | No | Event ID for field mapping |
| `onDisconnect` | function | No | Callback when disconnect clicked |
| `onDisconnected` | function | No | Callback after module cleared |

**Returns:** Promise (or WinJS.Promise)

**Example:**
```javascript
SalesforceLeadLib.initialize(container, leadData, credentials)
    .then(result => {
        // result = { success: true, message: '...' }
    });
```

---

### `SalesforceLeadLib.loadLead()`

Load a different lead into existing module instance.

**Syntax:**
```javascript
SalesforceLeadLib.loadLead(container, leadData, eventId)
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `container` | HTMLElement | Yes | Container with initialized module |
| `leadData` | Object | Yes | New lead data object |
| `eventId` | string | Yes | Event ID for field configuration |

**Returns:** Promise (or WinJS.Promise)

**Example:**
```javascript
const newLead = {
    FirstName: 'Jane',
    LastName: 'Smith',
    Company: 'Tech Corp',
    EventId: '12345'
};

SalesforceLeadLib.loadLead(container, newLead, '12345')
    .then(result => {
        console.log('New lead loaded');
    });
```

---

### `SalesforceLeadLib.transferLead()`

Transfer a lead to Salesforce programmatically (without UI interaction).

**Syntax:**
```javascript
SalesforceLeadLib.transferLead(leadData)
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `leadData` | Object | Yes | Lead data to transfer |

**Returns:** Promise (or WinJS.Promise)

**Example:**
```javascript
SalesforceLeadLib.transferLead(leadData)
    .then(result => {
        console.log('Transferred!');
        console.log('Salesforce ID:', result.salesforceId);
    })
    .catch(error => {
        console.error('Transfer failed:', error);
    });
```

---

### `SalesforceLeadLib.getStatus()`

Get transfer status for a specific lead.

**Syntax:**
```javascript
SalesforceLeadLib.getStatus(leadId)
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `leadId` | string | Yes | Lead ID from source system |

**Returns:** Promise (or WinJS.Promise)

**Response Object:**

| Property | Type | Description |
|----------|------|-------------|
| `status` | string | 'Success', 'Failed', 'Pending', or 'NOT_TRANSFERRED' |
| `salesforceId` | string | Salesforce Lead ID (if transferred) |
| `transferredAt` | string | ISO timestamp of transfer |
| `errorMessage` | string | Error message (if failed) |

**Example:**
```javascript
SalesforceLeadLib.getStatus('LEAD_12345')
    .then(status => {
        if (status.status === 'Success') {
            console.log('SF ID:', status.salesforceId);
        }
    });
```

---

### `SalesforceLeadLib.clear()`

Clear module and cleanup all resources.

**Syntax:**
```javascript
SalesforceLeadLib.clear(container)
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `container` | HTMLElement | Yes | Container to clear |

**Returns:** void

**Example:**
```javascript
SalesforceLeadLib.clear(container);
// Container is now empty, all intervals cleared
```

---

### `SalesforceLeadLib.version`

Get module version string.

**Type:** string (read-only)

**Example:**
```javascript
console.log(SalesforceLeadLib.version); // "1.0.0"
```

---

## 🎯 WinJS Integration

### LSPortal Page Definition

```javascript
(function () {
    "use strict";

    WinJS.UI.Pages.define("/pages/salesforce/salesforce.html", {

        ready: function (element, options) {
            const container = element.querySelector('#sfContainer');

            // Get current lead from app data
            const leadData = AppData.getCurrentLead();

            const credentials = {
                username: AppData.currentUser.email,
                orgId: AppData.salesforceOrgId,
                backendUrl: AppData.apiBaseUrl
            };

            const moduleOptions = {
                eventId: leadData.EventId,
                title: 'Lead Transfer',
                onDisconnect: () => {
                    // Navigate back or show confirmation
                    WinJS.Navigation.back();
                }
            };

            // Initialize (automatically returns WinJS.Promise)
            SalesforceLeadLib.initialize(
                container,
                leadData,
                credentials,
                moduleOptions
            ).then(
                function (result) {
                    console.log('Module initialized:', result);
                },
                function (error) {
                    console.error('Module failed:', error);
                    // Show error page or navigate away
                    WinJS.Navigation.navigate('/pages/error/error.html', {
                        message: error.message
                    });
                }
            );
        },

        unload: function () {
            // Cleanup when page unloads
            const container = document.querySelector('#sfContainer');
            if (container) {
                SalesforceLeadLib.clear(container);
            }
        }
    });
})();
```

### HTML Page

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Salesforce Lead Transfer</title>
    <script src="/lib/salesforceLeadLib/salesforceLeadLib.js"></script>
</head>
<body>
    <div id="sfContainer" style="width: 100%; height: 100vh;"></div>
</body>
</html>
```

---

## 🔧 Backend Requirements

The module expects these backend endpoints to be available:

### 1. Salesforce Status Check

**Endpoint:** `POST /api/salesforce/status`

**Request:**
```json
{
  "orgId": "00D5g000000abcd"
}
```

**Response:**
```json
{
  "connected": true,
  "username": "user@company.com",
  "instanceUrl": "https://company.my.salesforce.com"
}
```

---

### 2. Get Field Mapping

**Endpoint:** `GET /api/salesforce/field-mapping`

**Query Parameters:**
- `orgId`: Salesforce organization ID
- `eventId`: Event ID for configuration

**Response:**
```json
{
  "activeFields": ["FirstName", "LastName", "Company", "Email"],
  "customLabels": {
    "Company": "Company Name"
  },
  "customFields": [
    {
      "fieldName": "CustomField__c",
      "label": "Custom Field",
      "type": "text"
    }
  ]
}
```

---

### 3. Save Field Mapping

**Endpoint:** `POST /api/salesforce/field-mapping`

**Request:**
```json
{
  "orgId": "00D5g000000abcd",
  "eventId": "12345",
  "activeFields": ["FirstName", "LastName", "Company"],
  "customLabels": {},
  "customFields": []
}
```

**Response:**
```json
{
  "success": true,
  "message": "Field mapping saved"
}
```

---

### 4. Transfer Lead

**Endpoint:** `POST /api/salesforce/transfer`

**Request:**
```json
{
  "orgId": "00D5g000000abcd",
  "leadData": {
    "FirstName": "John",
    "LastName": "Doe",
    "Company": "Acme Corp",
    "Email": "john@acme.com"
  }
}
```

**Response (Success):**
```json
{
  "success": true,
  "salesforceId": "00Q5g00000ABCDE",
  "message": "Lead transferred successfully"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "REQUIRED_FIELD_MISSING",
  "message": "Required field missing: LastName"
}
```

---

### 5. Get Lead Status

**Endpoint:** `GET /api/salesforce/lead-status`

**Query Parameters:**
- `orgId`: Salesforce organization ID
- `leadId`: Lead ID from source system

**Response:**
```json
{
  "status": "Success",
  "salesforceId": "00Q5g00000ABCDE",
  "transferredAt": "2025-11-09T10:30:00.000Z",
  "errorMessage": null
}
```

---

## 🎨 Customization

### Changing Colors

The module uses CSS variables that can be overridden:

```css
/* Override after module loads */
.sf-lib-header {
    background: linear-gradient(135deg, #your-color-1, #your-color-2) !important;
}

.sf-btn-primary {
    background: linear-gradient(135deg, #your-color-1, #your-color-2) !important;
}
```

### Custom Header Title

```javascript
SalesforceLeadLib.initialize(container, leadData, credentials, {
    title: 'Custom Title Here'
});
```

### Disable Auto-Close Modal

Modify the `moduleConfig.autoCloseModalDelay` before initialization:

```javascript
// Access internal config (not recommended, but possible)
// This would require exposing config in the API
```

---

## 🐛 Troubleshooting

### Module Not Initializing

**Problem:** Module shows error on initialization

**Solutions:**
1. Check backend URL is correct and reachable
2. Verify orgId and eventId are valid
3. Check browser console for detailed errors
4. Ensure backend APIs are running

### Transfer Button Disabled

**Problem:** Transfer button is grayed out

**Cause:** Missing required fields

**Solution:** Ensure lead data has both `LastName` AND `Company` with non-empty values

```javascript
const leadData = {
    LastName: 'Doe',      // Required
    Company: 'Acme Corp', // Required
    // ... other fields
};
```

### WinJS Promise Not Working

**Problem:** Promise callbacks not firing in WinJS

**Solution:** The module automatically detects WinJS. Ensure WinJS is loaded before the module:

```html
<script src="/js/WinJS.js"></script>
<script src="/lib/salesforceLeadLib.js"></script>
```

### Styles Not Appearing

**Problem:** Module renders but looks unstyled

**Cause:** CSS injection blocked or failed

**Solution:** Check for Content Security Policy restrictions:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self' 'unsafe-inline'">
```

### API Status Always Shows Disconnected

**Problem:** Status indicator is red even when connected

**Solutions:**
1. Check backend `/api/salesforce/status` endpoint
2. Verify CORS headers if backend is on different domain
3. Check browser network tab for failed requests

---

## 📝 Examples

See [salesforceLeadLib-usage-example.html](../salesforceLeadLib-usage-example.html) for complete working examples.

---

## 🔐 Security Considerations

1. **XSS Protection**: All user input is escaped via `escapeHtml()`
2. **HTTPS**: Use HTTPS for production backends
3. **Authentication**: Backend should validate all requests
4. **CORS**: Configure CORS appropriately for your domain
5. **Input Validation**: Module validates email, phone, URL formats

---

## 📄 License

Internal use - LeadSuccess Team

---

## 📞 Support

For issues or questions, contact the development team or file an issue in the project repository.

---

**Version:** 1.0.0
**Last Updated:** November 2025
**Author:** LeadSuccess Development Team
