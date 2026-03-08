# LeadSuccess — Salesforce Integration
## Complete Technical Documentation

**Version:** 3.0
**Date:** March 2026
**Scope:** LeadSuccess Portal → Salesforce CRM Integration

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Authentication](#2-authentication)
3. [Salesforce Setup — LS_LeadId__c External ID](#3-salesforce-setup--ls_leadid__c-external-id)
4. [Application Walkthrough](#4-application-walkthrough)
5. [Lead Transfer — Single Lead](#5-lead-transfer--single-lead)
6. [Lead Transfer — Batch (Multiple Leads)](#6-lead-transfer--batch-multiple-leads)
7. [Lead Update via External ID (Upsert)](#7-lead-update-via-external-id-upsert)
8. [Status Colors and Definitions](#8-status-colors-and-definitions)
9. [Error Messages Reference](#9-error-messages-reference)
10. [Field Mapping Configuration](#10-field-mapping-configuration)
11. [Postman Collection Reference](#11-postman-collection-reference)
12. [API Reference](#12-api-reference)

---

## 1. Architecture Overview

```
LeadSuccess OData DB          LS Backend (Node.js)          Salesforce CRM
──────────────────────        ────────────────────          ──────────────
  LS_Lead (OData view)   →    /api/salesforce/leads    →    Lead (SObject)
  LS_LeadReport          →    /api/salesforce/check    →    Identity API
  LS_FieldMappings       →    /oauth/callback          →    OAuth2
  LS_SetLeadExportStatus ←    fire-and-forget call     ←    response
```

### Key Components

| Component | Technology | Role |
|-----------|-----------|------|
| Frontend | HTML/JS (vanilla) | List views, transfer UI, field configurator |
| Backend | Node.js + Express | Session management, SF proxy, field validation |
| Database | OData (SQL Server) | Lead data, field config, export status tracking |
| Salesforce | REST API v56 + jsforce | Lead creation, update, duplicate detection |

### Production URLs

| Environment | URL |
|-------------|-----|
| Backend (Azure) | `https://lsapisfbackend.convey.de` |
| Frontend (prod) | `https://deimos.convey.de` |
| Frontend (test) | `https://lstest.convey.de` |

---

## 2. Authentication

### 2.1 OAuth2 Flow (Production)

The application uses **Salesforce OAuth2 Authorization Code Flow** for production login.

**Step-by-step:**

1. User clicks **"Connect to Salesforce"** button in the header of the Lead list page
2. A popup window opens at `/oauth/start` — the backend redirects to Salesforce login
3. User logs in with their Salesforce credentials
4. Salesforce redirects to `/oauth/callback` with an authorization code
5. Backend exchanges the code for `access_token` + `refresh_token`
6. Connection is stored in-memory (server-side Map, keyed by `sessionID`)
7. Popup closes, parent page detects success via `window.postMessage`
8. Header updates to show connected user: `username @ Org Name`

**Session persistence:**
- Sessions are stored server-side in memory
- Cross-domain requests use `X-Session-Token` header (cookie not sent cross-domain)
- Session lifetime: 24 hours

### 2.2 Connection Status Indicators

| State | Header display | Color |
|-------|---------------|-------|
| Not connected | "Connect to Salesforce" button | Gray/outline |
| Connecting... | Button disabled, spinner | Gray |
| Connected | User name + "Disconnect" button | Green accent |

### 2.3 Disconnect

Clicking **"Disconnect"** clears the server-side session and removes the `X-Session-Token` from localStorage. The user must reconnect before performing any transfer.

---

## 3. Salesforce Setup — LS_LeadId__c External ID

### 3.1 Why LS_LeadId__c is Critical

The `LS_LeadId__c` field is a **custom Salesforce field** that stores the unique identifier of each lead from the LeadSuccess OData database. This field enables:

- **Duplicate prevention**: Before creating a lead, the backend checks if a lead with the same `LS_LeadId__c` already exists in SF
- **Upsert (Update or Insert)**: When transferring a lead that was already sent to SF, the system updates the existing record instead of creating a duplicate
- **Traceability**: Links every SF Lead back to its origin in the LeadSuccess system

### 3.2 Creating LS_LeadId__c in Salesforce

**Navigation:** Setup → Object Manager → Lead → Fields & Relationships → New

| Setting | Value |
|---------|-------|
| Data Type | Text |
| Field Label | LS Lead Id |
| Field Name | LS_LeadId__c (auto-generated) |
| Length | 36 |
| External ID | **Checked** |
| Unique | **Checked (Case Insensitive)** |
| Required | No |
| Auto add to custom report types | Recommended: Yes |

> **Important:** Both "External ID" and "Unique" must be checked. Without "External ID", the upsert API call will fail. Without "Unique", duplicate leads can be created if the same lead is transferred twice.

### 3.3 Field-Level Security

After creating the field, ensure your Salesforce API user has **Read + Edit** access to `LS_LeadId__c`:

**Navigation:** Setup → Profiles → [API User Profile] → Field-Level Security → Lead → LS Lead Id → Visible + Editable

---

## 4. Application Walkthrough

### 4.1 Login to the Portal

1. Navigate to the LeadSuccess portal
2. Enter your OData credentials (username / password)
3. Click **Login** — the system authenticates against the OData service
4. On success, you are redirected to the **Lead Report** or **Lead** list page

### 4.2 Lead List Pages

Two list views are available:

| Page | OData View | Description |
|------|-----------|-------------|
| LS Lead Report | `LS_LeadReport` | Enriched view with computed fields |
| LS Lead | `LS_Lead` | Raw lead data |

**Available actions from the list:**

- Click a row → navigate to the **Transfer Lead** detail page
- Check one or more rows → **Batch Transfer** button appears
- **Refresh** button → reloads data without full page reload
- **Connect to Salesforce** → OAuth popup
- **Disconnect** → clears SF session

### 4.3 Export Status Columns

Each lead displays its last transfer status directly in the list:

| Column | Description |
|--------|-------------|
| `LastExportStatus` | `success`, `failed`, `duplicate`, or empty |
| `LastExportTimestamp` | Date/time of last transfer attempt |
| `LastExportMilliseconds` | Duration of the SF API call in ms |
| `LastExportMessage` | Detailed message (SF ID on success, error on failure) |
| `ExportAttempts` | Total number of transfer attempts |

---

## 5. Lead Transfer — Single Lead

### 5.1 Accessing the Transfer Page

1. Click a lead row in the list → **Transfer Lead** page opens
2. Lead data is pre-filled from the OData record
3. Fields are organized by the **Field Mapping Configuration**

### 5.2 Field Editing

Before transfer, any field can be edited inline:
- Click the field value to edit
- Modified values are highlighted
- Changes are applied to the transfer payload only (not written back to OData)

### 5.3 Transfer Process

1. Click **Transfer to Salesforce**
2. The system calls `POST /api/salesforce/leads`
3. Backend checks for duplicates (by email or `LS_LeadId__c`)
4. If no duplicate: lead is **created** in SF → `201 Created`
5. If duplicate found: response `409 Conflict` with existing SF Lead ID
6. After transfer: `LS_SetLeadExportStatus` is called (fire-and-forget) to record the result in OData

### 5.4 Transfer Payload Structure

```json
{
  "leadData": {
    "FirstName": "Max",
    "LastName": "Mustermann",
    "Company": "Mustermann AG",
    "Email": "max@mustermann.de",
    "LS_LeadId__c": "c5722da9-7db5-4ff3-a352-7273e993f179"
  },
  "externalIdField": "LS_LeadId__c"
}
```

> **Note:** `externalIdField` is optional. If provided, the backend performs an upsert. If omitted, the backend performs a duplicate check + create.

---

## 6. Lead Transfer — Batch (Multiple Leads)

### 6.1 Selecting Leads for Batch Transfer

1. Check the checkbox on one or more lead rows (first column)
2. Use the **Select All** checkbox in the table header to select all visible leads
3. The **Batch Transfer (N)** button appears and shows the count of selected leads
4. The button activates when 2 or more leads are selected

### 6.2 Starting a Batch Transfer

1. Click **Batch Transfer (N)**
2. A confirmation modal appears: "Transfer N leads to Salesforce?"
3. Click **Confirm** to start

### 6.3 Batch Progress Modal

During transfer, a progress modal shows:

| Element | Description |
|---------|-------------|
| Progress bar | X / N leads processed |
| Current lead | Name and company being transferred |
| Results list | Live list of completed leads with status |
| Cancel button | Stops after current lead completes |

### 6.4 Batch Behavior

- Transfers are **sequential** (one lead at a time) to respect Salesforce API limits
- Each lead goes through the same process as a single transfer
- `LS_SetLeadExportStatus` is called for each lead (fire-and-forget)
- Row tinting updates in real-time after each lead completes

### 6.5 Batch Summary Modal

After completion (or cancellation), a summary modal shows:

| Counter | Description |
|---------|-------------|
| Success | Leads successfully created or updated in SF |
| Failed | Leads that encountered an error |
| Duplicate | Leads already existing in SF (409 response) |
| Skipped | Leads not processed due to cancellation |

An expandable list shows each lead with its individual result and message.

### 6.6 Cancellation

Clicking **Cancel** during a batch:
- Sets a cancellation flag
- The current lead in progress completes normally
- All remaining leads are marked as **Skipped**
- The summary modal shows the final state

---

## 7. Lead Update via External ID (Upsert)

### 7.1 How Upsert Works

When `externalIdField: "LS_LeadId__c"` is included in the transfer payload, the backend uses **Salesforce upsert** instead of create:

```
jsforce: conn.sobject('Lead').upsert(leadData, 'LS_LeadId__c')
```

Salesforce behavior:
- If a Lead with the given `LS_LeadId__c` value **exists** → **UPDATE** the existing record
- If no Lead with that value exists → **CREATE** a new record

### 7.2 Response

```json
{
  "success": true,
  "salesforceId": "00QgK00000Bgcc1UAB",
  "isUpdate": true,
  "message": "Lead successfully updated in Salesforce",
  "leadData": { ... },
  "validationWarnings": [],
  "attachments": []
}
```

| Field | Description |
|-------|-------------|
| `isUpdate` | `true` if existing record was updated, `false` if new record created |
| `salesforceId` | The SF Lead ID (18-char) |
| `validationWarnings` | Non-blocking field warnings (e.g. invalid format) |

### 7.3 Field Mapping Configuration for Upsert

In the **Field Configurator**, map the `Id` field to `LS_LeadId__c`:

- Field: `Id` (OData lead identifier)
- Custom Label: `LS_LeadId__c`
- Status: Active

When this mapping is active, every transfer automatically includes `LS_LeadId__c` and uses upsert mode.

---

## 8. Status Colors and Definitions

### 8.1 Row Tinting (Lead Lists)

After a lead has been transferred, the row background changes to reflect the result:

| Color | Status | Meaning |
|-------|--------|---------|
| Green (light) | `success` | Lead successfully created or updated in Salesforce |
| Red (light) | `failed` | Transfer failed — see `LastExportMessage` for details |
| Orange (light) | `duplicate` | Lead already exists in SF (transferred without update) |

### 8.2 Badge Dot

A small colored dot appears in the first visible cell of each row to indicate status at a glance, even when the export status columns are scrolled out of view.

### 8.3 Batch Modal Colors

| Color | Meaning |
|-------|---------|
| Green | Transfer succeeded |
| Red | Transfer failed |
| Orange | Duplicate detected (409) |
| Gray | Lead skipped (batch cancelled) |

---

## 9. Error Messages Reference

### 9.1 Transfer Errors

| HTTP Status | Message | Cause | Action |
|-------------|---------|-------|--------|
| 400 | "LastName and Company are required" | Missing required SF fields | Check field mapping configuration |
| 401 | "Not connected to Salesforce" | No active SF session | Click "Connect to Salesforce" |
| 409 | "Duplicate lead found" | Lead with same email/LS_LeadId__c exists | Use upsert mode or check SF |
| 500 | "Transfer failed" | SF API error | Check SF system status, retry |

### 9.2 Authentication Errors

| Error | Cause | Action |
|-------|-------|--------|
| "INVALID_SESSION_ID" | SF token expired | Disconnect and reconnect |
| "invalid_grant" | Wrong SF credentials | Check username/password/security token |
| "redirect_uri_mismatch" | OAuth config error | Check SF Connected App redirect URI |

### 9.3 Salesforce API Errors

| SF Error Code | Meaning |
|---------------|---------|
| `DUPLICATE_VALUE` | Field marked as Unique already has this value |
| `INVALID_CROSS_REFERENCE_KEY` | Referenced record ID does not exist |
| `NOT_FOUND` | External ID field not accessible (check Field-Level Security) |
| `REQUIRED_FIELD_MISSING` | Required SF field not provided |
| `STRING_TOO_LONG` | Field value exceeds maximum length |

---

## 10. Field Mapping Configuration

### 10.1 Overview

The **Field Configurator** page allows mapping OData field names to Salesforce field names.

| Setting | Description |
|---------|-------------|
| Active | Field is included in the SF transfer payload |
| Inactive | Field is displayed in the list but NOT transferred to SF |
| Custom Label | Maps OData field name to a different SF field name (e.g. `Id` → `LS_LeadId__c`) |

### 10.2 System Fields (Excluded from Transfer)

These fields are always excluded from the SF transfer payload, regardless of configuration:

- `KontaktViewId`, `DeviceId`, `DeviceRecordId`
- `CreatedById`, `LastModifiedById`, `CreatedDate`, `LastModifiedDate`, `SystemModstamp`
- `IsReviewed`, `IsIncomplete`, `QuestionnaireEmpty`, `QuestionnaireIncomplete`
- `AttachmentIdList`, `EventId`, `RequestBarcode`
- `LastExportStatus`, `LastExportTimestamp`, `LastExportMilliseconds`, `LastExportMessage`, `ExportAttempts`

### 10.3 Standard vs Custom SF Fields

| Type | Format | Example |
|------|--------|---------|
| Standard Salesforce field | No suffix | `FirstName`, `LastName`, `Company` |
| Custom Salesforce field | Ends with `__c` | `Question01__c`, `LS_LeadId__c` |

The system automatically detects custom fields by the `__c` suffix.

---

## 11. Postman Collection Reference

### 11.1 Collection: Salesforce-LS-Dev

**ID:** `c2e160aa-7dc7-4465-83a0-2d23d0ec39d8`
**Workspace:** My Workspace

**Collection Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `BACKEND_URL` | Backend base URL | `http://localhost:3000` |
| `ORG_ID` | Salesforce Org identifier | `default` |
| `SF_CLIENT_ID` | Connected App Client ID | `3MVG9...` |
| `SF_CLIENT_SECRET` | Connected App Client Secret | `D63B...` |
| `SF_USERNAME` | SF API username | `user@org.com` |
| `SF_PASSWORD` | SF API password | `password` |
| `SF_SECURITY_TOKEN` | SF security token | `token123` |
| `_accessToken` | Auto-populated after Auth | (populated at runtime) |
| `_endpoint` | SF instance URL | `https://xxx.salesforce.com` |
| `_orgId` | SF Organization ID | `00DgK...` |
| `LEAD_ID` | SF Lead ID (18-char) | `00QgK...` |

**Pre-request Script (collection level):** Automatically calls the SF Username+Password OAuth flow if `_accessToken` is empty.

---

### 11.2 Folder: Auth

Handles Salesforce OAuth authentication.

| Request | Method | URL | Description |
|---------|--------|-----|-------------|
| Username Password Flow | POST | `https://login.salesforce.com/services/oauth2/token` | Gets `access_token` using password grant. Saves `_accessToken`, `_endpoint`, `_orgId` to collection variables. |
| Check Connection | GET | `{{BACKEND_URL}}/api/salesforce/check` | Verifies the backend SF session is active. Returns `connected: true` + user info. |

---

### 11.3 Folder: Leads - Backend API

All requests go through the LS backend (`{{BACKEND_URL}}/api/salesforce/leads`). The backend manages duplicate detection, field validation, and SF connection.

| Request | Method | Description |
|---------|--------|-------------|
| Create Lead - Minimal | POST | Creates a lead with only `LastName`, `Company`, `LS_LeadId__c` |
| Create Lead - Full | POST | Creates a lead with all standard SF fields + `LS_LeadId__c` |
| Create Lead - With Custom Fields | POST | Creates a lead including custom fields (`Question01__c`) |
| Create Lead - All Your Fields | POST | Full lead with all available fields |
| Update Lead via LS_LeadId__c (Upsert) | POST | Updates existing SF lead using External ID. Requires `externalIdField: "LS_LeadId__c"` in body. Returns `isUpdate: true`. |
| Get All Leads (direct SF) | GET | SOQL query to list last 20 leads with `LS_LeadId__c` values |

**Request Body Structure — Create:**
```json
{
  "leadData": {
    "LastName": "Mustermann",
    "Company": "Mustermann AG",
    "LS_LeadId__c": "<OData Lead GUID>"
  }
}
```

**Request Body Structure — Upsert/Update:**
```json
{
  "leadData": {
    "LastName": "Mustermann Updated",
    "Company": "Mustermann AG",
    "LS_LeadId__c": "<OData Lead GUID>",
    "Phone": "+49 30 999999",
    "Title": "Senior Manager"
  },
  "externalIdField": "LS_LeadId__c"
}
```

**Test Script (on all Create requests):**
```javascript
const json = pm.response.json();
pm.test('Status 200 or 201', () => pm.expect(pm.response.code).to.be.oneOf([200, 201]));
pm.test('Has salesforceId', () => pm.expect(json.salesforceId).to.be.a('string'));
if (json.salesforceId) {
    pm.collectionVariables.set('LEAD_ID', json.salesforceId);
}
```

---

### 11.4 Folder: Direct SF API (sans backend)

Direct calls to the Salesforce REST API, bypassing the LS backend. Useful for debugging and validation. Requires `Authorization: Bearer {{_accessToken}}`.

| Request | Method | URL | Description |
|---------|--------|-----|-------------|
| CREATE Lead (direct SF) | POST | `{{_endpoint}}/services/data/v56.0/sobjects/Lead` | Creates lead directly in SF. Body must include `LastName`, `Company`, `LS_LeadId__c`. |
| UPDATE Lead via LS_LeadId__c | PATCH | `{{_endpoint}}/services/data/v56.0/sobjects/Lead/LS_LeadId__c/<GUID>` | Upsert via External ID. Returns 204 No Content on success. Body must NOT include `LS_LeadId__c`. |
| Get All Leads | GET | `{{_endpoint}}/services/data/v56.0/query?q=SELECT...` | SOQL query, returns leads with SF Id and LS_LeadId__c. |

---

### 11.5 Folder: Lead UPDATE via External ID (Upsert)

End-to-end test flow using the LS backend with explicit session token management.

| Step | Request | Description |
|------|---------|-------------|
| 1 | Login (get session token) | POST `/api/salesforce/login` with `{accessToken, instanceUrl, organizationId}`. Saves `sessionId` → `SF_SESSION_TOKEN`. |
| 2 | Transfer Lead (CREATE) | POST `/api/salesforce/leads` with `X-Session-Token: {{SF_SESSION_TOKEN}}`. Creates new lead. |
| 3 | Transfer Lead (UPDATE) | POST `/api/salesforce/leads` with `externalIdField: "LS_LeadId__c"` and `X-Session-Token`. Updates existing lead. |

**Why X-Session-Token?** The backend runs on Azure (separate domain from the frontend). Browser cookies are not sent cross-domain, so the session token is passed explicitly in the `X-Session-Token` header.

---

### 11.6 Folder: Files Management

Manages Salesforce ContentVersion (file attachments linked to leads).

| Request | Method | Description |
|---------|--------|-------------|
| Get All Files (Details) | GET | Lists all ContentVersions with metadata |
| Get All File IDs (for batch delete) | GET | Returns only IDs for bulk operations |
| Delete Single File | DELETE | Deletes one ContentDocument by ID |
| Delete All Files (Batch - max 200) | DELETE | Bulk delete up to 200 files |

---

## 12. API Reference

### 12.1 POST /api/salesforce/leads

Creates or updates a lead in Salesforce.

**Headers:**
```
Content-Type: application/json
X-Org-Id: {orgId}
X-Session-Token: {sessionToken}   (for cross-domain requests)
```

**Body:**
```json
{
  "leadData": {
    "LastName": "string (required)",
    "Company": "string (required)",
    "LS_LeadId__c": "string (GUID, recommended)",
    "...": "any active mapped SF field"
  },
  "externalIdField": "LS_LeadId__c (optional — triggers upsert mode)",
  "attachments": []
}
```

**Responses:**

| Status | Body | Meaning |
|--------|------|---------|
| 200 | `{success, salesforceId, isUpdate, message, leadData}` | Lead created or updated |
| 409 | `{message: "Duplicate lead found", salesforceId, existingLead}` | Duplicate detected (no upsert mode) |
| 400 | `{message: "LastName and Company are required"}` | Missing required fields |
| 401 | `{message: "Not connected to Salesforce"}` | No active SF session |
| 500 | `{message: "Transfer failed", error}` | SF API error |

---

### 12.2 GET /api/salesforce/check

Checks whether a Salesforce connection is active for the current session.

**Response (connected):**
```json
{
  "connected": true,
  "userInfo": {
    "username": "user@org.com",
    "display_name": "Max Mustermann",
    "organization_name": "My Org",
    "organization_id": "00DgK..."
  },
  "tokens": {
    "access_token": "...",
    "instance_url": "https://xxx.salesforce.com"
  }
}
```

**Response (not connected):**
```json
{
  "connected": false,
  "message": "No valid Salesforce connection for org: {sessionId}"
}
```

---

### 12.3 POST /api/salesforce/login

Creates a backend session from an existing Salesforce access token. Used by Postman and API clients that cannot perform the OAuth popup flow.

**Body:**
```json
{
  "accessToken": "SF access token from OAuth flow",
  "instanceUrl": "https://xxx.salesforce.com",
  "organizationId": "00DgK..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Connected",
  "sessionId": "session-id-to-use-as-X-Session-Token"
}
```

---

### 12.4 GET /api/salesforce/leads/export-status

Returns the export status for a specific lead.

**Query params:** `id={KontaktViewId}`

---

### 12.5 OData: LS_SetLeadExportStatus

Called after every transfer (fire-and-forget) to record the result in the OData database.

**Endpoint:**
```
GET {odataBase}/LS_SetLeadExportStatus?id={guid}&status={status}&message={msg}&milliseconds={ms}
```

**Parameters:**

| Parameter | Type | Values |
|-----------|------|--------|
| `id` | GUID (lowercase) | OData Lead `Id` field |
| `status` | string | `success`, `failed`, `duplicate` |
| `message` | string | SF Lead ID on success, error message on failure |
| `milliseconds` | number | Duration of SF API call in ms |

**Response structure:** `data.d.results[0]`

> **Note:** This endpoint is only available on `deimos.convey.de`, not on `lstest.convey.de`.

---

*Document generated: March 2026 — LeadSuccess Salesforce Integration v3.0*
