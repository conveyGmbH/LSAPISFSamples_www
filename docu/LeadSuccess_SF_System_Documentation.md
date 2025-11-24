# LeadSuccess API for Salesforce - System Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Authentication Flow](#authentication-flow)
4. [Data Flow](#data-flow)
5. [Salesforce Integration](#salesforce-integration)
6. [Field Mapping System](#field-mapping-system)
7. [Attachment Handling](#attachment-handling)
8. [Transfer Process](#transfer-process)
9. [Error Handling](#error-handling)
10. [API Reference](#api-reference)

---

## System Overview

LeadSuccess API for Salesforce is a web application that bridges LeadSuccess CRM data with Salesforce. It allows users to:
- Browse leads from LeadSuccess events
- Map custom fields to Salesforce fields
- Transfer leads with attachments to Salesforce
- Manage field configurations and mappings

### Technology Stack
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend**: Node.js, Express.js
- **Authentication**: Basic Auth (LeadSuccess), OAuth 2.0 (Salesforce)
- **APIs**: LeadSuccess OData API, Salesforce REST API
- **Libraries**: jsforce, express-session, cors

---

## Architecture

```
┌─────────────────┐
│   User Browser  │
│   (Frontend)    │
└────────┬────────┘
         │
         │ HTTP/HTTPS
         │
┌────────▼────────────────────────────────────┐
│         Express Backend Server              │
│  ┌──────────────┐  ┌──────────────────┐     │
│  │ Session      │  │ Salesforce       │     │
│  │ Management   │  │ OAuth Manager    │     │
│  └──────────────┘  └──────────────────┘     │
└────────┬───────────────────┬────────────────┘
         │                   │
         │                   │ OAuth 2.0 / REST API
         │                   │
┌────────▼────────┐   ┌──────▼──────────┐
│  LeadSuccess    │   │   Salesforce    │
│  OData API      │   │   Platform      │
└─────────────────┘   └─────────────────┘
```

---

## Authentication Flow

### 1. LeadSuccess Authentication

#### Login Process
1. User enters credentials on `/index.html`
2. Credentials encoded in Base64: `btoa(userName:password)`
3. Stored in `sessionStorage.credentials`
4. Included in all API requests as `Authorization: Basic {credentials}`

#### Implementation
```javascript
// loginController.js
const credentials = btoa(`${userName}:${password}`);
sessionStorage.setItem("serverName", serverName);
sessionStorage.setItem("apiName", apiName);
sessionStorage.setItem("credentials", credentials);
sessionStorage.setItem("userName", userName);
```

#### Session Management
- **sessionStorage**: Credentials, server info, selected lead data
- **localStorage**: Field mappings, custom labels, persistent settings
- **Duration**: Session ends on browser close

### 2. Salesforce OAuth 2.0 Authentication

#### OAuth Flow
```
┌─────────┐                                  ┌──────────────┐
│ Browser │                                  │  Salesforce  │
└────┬────┘                                  └──────┬───────┘
     │                                              │
     │ 1. Click "Connect to Salesforce"             │
     │─────────────────────────────────────────────▶
     │                                              │
     │ 2. Redirect to SF login                      │
     │◀─────────────────────────────────────────────
     │                                              │
     │ 3. User authenticates on SF                  │
     │─────────────────────────────────────────────▶
     │                                              │
     │ 4. SF redirects with authorization code      │
     │◀─────────────────────────────────────────────
     │                                              │
     │ 5. Backend exchanges code for tokens         │
     │─────────────────────────────────────────────▶
     │                                              │
     │ 6. Tokens stored in session                  │
     │◀─────────────────────────────────────────────
     │                                              │
     │ 7. Connection established                    │
     │                                              │
```

#### Implementation

**Frontend** (`displayLeadTransferController.js`):
```javascript
async function handleConnectClick() {
  const authUrl = `${appConfig.apiBaseUrl}/salesforce/auth`;
  const response = await fetch(authUrl, { credentials: 'include' });
  const { url } = await response.json();

  // Open OAuth flow in popup
  window.open(url, 'Salesforce OAuth', 'width=600,height=700');
}
```

**Backend** (`server.js`):
```javascript
// Generate OAuth URL
app.get('/api/salesforce/auth', (req, res) => {
  const authUrl = oauth2.getAuthorizationUrl({
    scope: 'api id web refresh_token'
  });
  res.json({ url: authUrl });
});

// Handle OAuth callback
app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;

  // Exchange code for tokens
  const conn = new jsforce.Connection({ oauth2 });
  await conn.authorize(code);

  // Store tokens in session
  req.session.salesforce = {
    accessToken: conn.accessToken,
    refreshToken: conn.refreshToken,
    instanceUrl: conn.instanceUrl
  };

  // Store connection
  storeConnection(sessionData);
});
```

#### Session Persistence
- **Server-side**: Express session with cookies
- **Client-side**: localStorage for connection state
- **Cross-origin**: `X-Org-Id` header for production authentication

```javascript
// Production authentication header
fetch('/api/salesforce/leads', {
  method: 'POST',
  headers: {
    'X-Org-Id': localStorage.getItem('orgId') || 'default'
  },
  credentials: 'include'
});
```

---

## Data Flow

### 1. Lead Data Retrieval

#### From LeadSuccess API
```javascript
// displayController.js
const endpoint = `LS_Lead?$filter=EventId eq '${eventId}'&$format=json`;
const data = await apiService.request("GET", endpoint);

// Data structure
{
  d: {
    results: [
      {
        Id: "b17422ee-dfc0-4b5d...",
        FirstName: "John",
        LastName: "Doe",
        Email: "john@example.com",
        Company: "Acme Inc",
        Phone: "+1234567890",
        // ... 30+ fields
        CreatedDate: "/Date(1709136000000)/",
        LastModifiedDate: "/Date(1709222400000)/",
        AttachmentIdList: "att1,att2,att3",
        EventId: "event123"
      }
    ]
  }
}
```

#### Data Storage Flow
```
API Response
    ↓
Parse & Transform
    ↓
sessionStorage.selectedLeadData  ← Temporary storage
    ↓
displayLeadData()  ← Render in UI
    ↓
User Edits
    ↓
localStorage.lead_edits_{eventId}  ← Persistent edits
```

### 2. Field Rendering

**Field Display Categories:**

1. **Editable Fields** (with edit icon):
   - FirstName, LastName, Email, Phone
   - Company, Title, Industry, Department
   - Address fields (Street, City, State, etc.)
   - Custom fields (Question01-30, Answer01-30, etc.)

2. **Read-only Fields** (locked):
   - Id, CreatedDate, LastModifiedDate
   - CreatedById, LastModifiedById
   - SystemModstamp, DeviceId, EventId
   - RequestBarcode, StatusMessage

3. **System Fields** (hidden from UI):
   - __metadata, KontaktViewId

**Rendering Implementation:**
```javascript
// displayLeadTransferController.js
function displayLeadData(leadData) {
  const container = document.getElementById('leadData');

  for (const [fieldName, value] of Object.entries(leadData)) {
    // Skip metadata
    if (fieldName === '__metadata') continue;

    // Get field configuration
    const config = getSalesforceFieldConfig(fieldName);
    const isActive = fieldMappingService.isFieldActive(fieldName);

    // Create field element
    const fieldElement = createFieldElement(fieldName, value, config);
    container.appendChild(fieldElement);
  }
}
```

---

## Salesforce Integration

### Connection Manager

**Multi-Organization Support:**
```javascript
// server.js
const connections = new Map(); // orgId → connection data

function storeConnection(sessionData) {
  const orgId = sessionData.organizationId || 'default';
  const conn = createConnection(sessionData);

  connections.set(orgId, {
    connection: conn,
    userInfo: sessionData.userInfo,
    timestamp: Date.now()
  });
}

function getConnection(orgId) {
  const connData = connections.get(orgId);
  return connData ? connData.connection : null;
}
```

**Connection Retrieval:**
```javascript
function getCurrentOrgId(req) {
  return req.headers['x-org-id'] ||
         req.session.currentOrgId ||
         'default';
}

// Usage in endpoints
app.post('/api/salesforce/leads', async (req, res) => {
  const orgId = getCurrentOrgId(req);
  const conn = getConnection(orgId);

  if (!conn) {
    return res.status(401).json({
      message: 'Not connected to Salesforce'
    });
  }

  // Use connection...
});
```

---

## Field Mapping System

### Architecture

```
┌──────────────────────────────────────────────┐
│         Field Mapping Service                │
│                                              │
│  ┌────────────────────────────────────┐      │
│  │  In-Memory Cache                   │      │
│  │  - customLabels: {}                │      │
│  │  - fieldConfigs: {}                │      │
│  │  - activeFields: Set()             │      │
│  └────────────────────────────────────┘      │
│                                              │
│  ┌────────────────────────────────────┐      │
│  │  Database Persistence              │      │
│  │  - Load from API on init           │      │
│  │  - Save on user changes            │      │
│  │  - Bulk update support             │      │
│  └────────────────────────────────────┘      │
└──────────────────────────────────────────────┘
```

### Custom Label Mapping

**Purpose**: Map LeadSuccess field names to Salesforce field names

**Example Mappings:**
```javascript
{
  "Question07": "Hot__c",           // Custom field
  "Answer07": "HotDetails__c",      // Custom field
  "Text07": "HotComments__c",       // Custom field
  "FirstName": "FirstName",         // Standard (unchanged)
  "Email": "Email"                  // Standard (unchanged)
}
```

**Implementation:**
```javascript
// FieldMappingService.js
class FieldMappingService {
  constructor() {
    this.customLabels = {};       // Field name mappings
    this.fieldConfigs = {};       // Field configurations
    this.currentEventId = null;   // Current event context
  }

  async setCustomLabel(fieldName, customLabel) {
    // Validate Salesforce field name format
    const isValid = /^[a-zA-Z][a-zA-Z0-9_]*(__c)?$/.test(customLabel);

    if (!isValid) {
      throw new Error('Invalid Salesforce field name format');
    }

    // Update in-memory cache
    this.customLabels[fieldName] = customLabel;

    // Persist to database
    await this.saveFieldMappingsToAPI();

    return true;
  }

  getCustomLabel(fieldName) {
    return this.customLabels[fieldName] || fieldName;
  }
}
```

### Field Configuration

**Configuration Options:**
```javascript
{
  fieldName: {
    active: true,              // Field enabled/disabled
    customLabel: "Hot__c",     // Custom SF field name
    type: "Text",              // Salesforce field type
    required: false,           // Required in SF
    maxLength: 255            // Max length validation
  }
}
```

### Mapping Process

```javascript
// FieldMappingService.js
mapFieldNamesForSalesforce(leadData) {
  const mappedData = {};

  // System fields excluded from transfer
  const systemFieldsToExclude = [
    '__metadata', 'KontaktViewId', 'Id',
    'CreatedDate', 'LastModifiedDate',
    'CreatedById', 'LastModifiedById',
    'DeviceId', 'DeviceRecordId',
    'RequestBarcode', 'EventId',
    'SystemModstamp', 'AttachmentIdList',
    'IsReviewed', 'StatusMessage'
  ];

  for (const [originalField, value] of Object.entries(leadData)) {
    // 1. Exclude system fields
    if (systemFieldsToExclude.includes(originalField)) {
      console.log(`Excluding system field: ${originalField}`);
      continue;
    }

    // 2. Check if field is active
    const isActive = this.isFieldActive(originalField);
    if (isActive === false) {
      console.log(`Excluding inactive field: ${originalField}`);
      continue;
    }

    // 3. Apply custom label mapping
    let salesforceFieldName = originalField;
    const customLabel = this.customLabels[originalField];
    const defaultLabel = this.formatFieldLabel(originalField);

    // Validate SF field name format
    const isValidSalesforceFieldName = (name) => {
      if (!name || name.trim() === '') return false;
      return /^[a-zA-Z][a-zA-Z0-9_]*(__c)?$/.test(name.trim());
    };

    // Use custom label if valid and different from default
    if (customLabel &&
        customLabel.trim() !== '' &&
        customLabel !== defaultLabel) {

      const trimmedLabel = customLabel.trim();

      if (isValidSalesforceFieldName(trimmedLabel)) {
        salesforceFieldName = trimmedLabel;
      } else {
        salesforceFieldName = originalField;
      }
    }

    // 4. Add to mapped data
    mappedData[salesforceFieldName] = value;
  }

  return mappedData;
}
```

**Why Exclude System Fields?**

1. **Conflict Prevention**: Salesforce auto-generates `Id`, `CreatedDate`, `CreatedById`
2. **Internal Fields**: `DeviceId`, `EventId`, `__metadata` are LeadSuccess-specific
3. **Separate Handling**: Attachments transferred via different API
4. **Data Integrity**: Prevents validation errors in Salesforce

---

## Attachment Handling

### Attachment Flow

```
1. Fetch Attachment Metadata
        ↓
2. Retrieve Attachment Body (Base64)
        ↓
3. Process & Validate
        ↓
4. Transfer to Salesforce
        ↓
5. Link to Lead Record
```

### Implementation

**Fetching Attachments:**
```javascript
// displayLeadTransferController.js
async function fetchAttachments(attachmentIdList) {
  if (!attachmentIdList) return [];

  const attachmentIds = attachmentIdList.split(",")
    .filter(id => id.trim() !== "");

  const serverName = sessionStorage.getItem("serverName");
  const apiName = sessionStorage.getItem("apiName");
  const apiService = new ApiService(serverName, apiName);

  const attachments = [];

  for (let i = 0; i < attachmentIds.length; i++) {
    const attachmentId = attachmentIds[i];

    // Fetch attachment data
    const endpoint = `LS_AttachmentById?Id=%27${encodeURIComponent(attachmentId)}%27&$format=json`;
    const data = await apiService.request("GET", endpoint);

    let attachmentData = null;
    if (data?.d?.results?.length > 0) {
      attachmentData = data.d.results[0];
    } else if (data?.d) {
      attachmentData = data.d;
    }

    if (attachmentData?.Body) {
      // Detect file type
      const fileName = attachmentData.Name || '';
      const extension = fileName.split('.').pop().toLowerCase();
      const isSVG = extension === 'svg' ||
                    attachmentData.ContentType === 'image/svg+xml';

      let processedBody = attachmentData.Body;
      let finalContentType = attachmentData.ContentType;

      // Process SVG files
      if (isSVG) {
        try {
          // Check if already Base64
          const testDecode = atob(attachmentData.Body.replace(/\s+/g, ''));

          if (testDecode.includes('<svg') || testDecode.includes('<?xml')) {
            processedBody = attachmentData.Body.replace(/\s+/g, '');
          } else {
            throw new Error('Not valid Base64 SVG');
          }
        } catch (decodeError) {
          // Raw XML detected, encode to Base64
          if (attachmentData.Body.includes('<svg') ||
              attachmentData.Body.includes('<?xml')) {
            processedBody = btoa(decodeURIComponent(
              encodeURIComponent(attachmentData.Body)
            ));
          }
        }
        finalContentType = 'image/svg+xml';
      } else {
        // Clean Base64 string
        processedBody = attachmentData.Body.replace(/\s+/g, '');

        // Determine content type from extension
        if (!finalContentType) {
          const mimeTypes = {
            'pdf': 'application/pdf',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'txt': 'text/plain',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          };
          finalContentType = mimeTypes[extension] || 'application/octet-stream';
        }
      }

      attachments.push({
        Name: fileName,
        Body: processedBody,
        ContentType: finalContentType
      });
    }
  }

  return attachments;
}
```

**Transferring Attachments to Salesforce:**
```javascript
// server.js
async function transferAttachmentsToSalesforce(leadId, attachments, conn) {
  const attachmentResults = [];

  for (const attachment of attachments) {
    try {
      // Create Salesforce Attachment
      const sfAttachment = {
        Name: attachment.Name,
        Body: attachment.Body,
        ContentType: attachment.ContentType,
        ParentId: leadId  // Link to Lead
      };

      const result = await conn.sobject('Attachment').create(sfAttachment);

      attachmentResults.push({
        name: attachment.Name,
        success: result.success,
        salesforceId: result.id
      });

    } catch (error) {
      attachmentResults.push({
        name: attachment.Name,
        success: false,
        error: error.message
      });
    }
  }

  return attachmentResults;
}
```

**Attachment Display:**
```javascript
// displayLeadTransferController.js
async function displayAttachmentsPreview() {
  const attachmentIds = selectedLeadData.AttachmentIdList
    .split(",")
    .filter(id => id.trim() !== "");

  if (attachmentIds.length === 0) return;

  // Create preview container
  const attachmentsPreviewContainer = document.createElement("div");
  attachmentsPreviewContainer.className = "attachments-preview";

  // Add title
  const title = document.createElement("h4");
  title.textContent = "Attachments to Transfer";
  attachmentsPreviewContainer.appendChild(title);

  // Create list
  const attachmentsList = document.createElement("ul");
  attachmentsList.className = "attachments-list";

  // Fetch and display each attachment
  const attachments = await fetchAttachments(attachmentIdList);

  attachments.forEach(attachment => {
    const listItem = document.createElement("li");
    listItem.className = "attachment-item";

    const icon = getFileIcon(attachment.ContentType, attachment.Name);
    const fileSize = formatFileSize(attachment.BodyLength);

    listItem.innerHTML = `
      <div class="attachment-icon">${icon}</div>
      <div class="attachment-details">
        <div class="attachment-name">${attachment.Name}</div>
        <div class="attachment-meta">
          <span class="attachment-type">${attachment.ContentType}</span>
          <span class="attachment-size">${fileSize}</span>
        </div>
      </div>
    `;

    attachmentsList.appendChild(listItem);
  });

  attachmentsPreviewContainer.appendChild(attachmentsList);
}
```

---

## Transfer Process

### Complete Transfer Flow

```
┌─────────────────────────────────────────────────┐
│  1. User clicks "Transfer to Salesforce"        │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  2. Validate Lead Data                          │
│     - Check required fields (LastName, Company) │
│     - Validate email format                     │
│     - Validate phone numbers                    │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  3. Check for Duplicates                        │
│     - Query SF: LastName + Company              │
│     - If found → Show warning                   │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  4. Map Field Names                             │
│     - Apply custom label mappings               │
│     - Exclude system fields                     │
│     - Filter inactive fields                    │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  5. Fetch Attachments                           │
│     - Retrieve from LeadSuccess API             │
│     - Process Base64 encoding                   │
│     - Determine content types                   │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  6. Send to Backend                             │
│     - POST /api/salesforce/leads                │
│     - Include X-Org-Id header                   │
│     - Send leadData + attachments               │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  7. Backend Validation                          │
│     - Verify SF connection                      │
│     - Validate field names against SF metadata  │
│     - Remove unknown fields                     │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  8. Create Lead in Salesforce                   │
│     - conn.sobject('Lead').create(leadData)     │
│     - Receive SF Lead ID                        │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  9. Transfer Attachments                        │
│     - For each attachment:                      │
│       - Create SF Attachment                    │
│       - Link to Lead (ParentId)                 │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  10. Return Results                             │
│      - Success/failure status                   │
│      - SF Lead ID                               │
│      - Attachment transfer results              │
└─────────────────────────────────────────────────┘
```

### Implementation

**Frontend Transfer Function:**
```javascript
// displayLeadTransferController.js
async function handleTransferButtonClick() {
  try {
    // 1. Validate lead data
    if (!selectedLeadData) {
      showError('No lead data available');
      return;
    }

    // 2. Run Salesforce validation
    const validation = await window.salesforceFieldMapper
      .validateLeadForSalesforce(selectedLeadData);

    if (!validation.isValid) {
      showValidationErrors(validation.errors);
      return;
    }

    // 3. Check for duplicates
    const duplicateCheck = await checkForDuplicates(
      selectedLeadData.LastName,
      selectedLeadData.Company
    );

    if (duplicateCheck.isDuplicate) {
      const confirmed = confirm(
        `Duplicate found: ${duplicateCheck.existingLead.name}\n` +
        `Continue with transfer?`
      );
      if (!confirmed) return;
    }

    // 4. Map field names
    const mappedLeadData = window.fieldMappingService
      .mapFieldNamesForSalesforce(selectedLeadData);

    // 5. Fetch attachments
    const attachments = await fetchAttachments(
      selectedLeadData.AttachmentIdList
    );

    // 6. Transfer to Salesforce
    const result = await transferLeadDirectlyToSalesforce(
      mappedLeadData,
      attachments
    );

    if (result.ok) {
      const data = await result.json();
      showSuccess(
        `Lead transferred successfully!\n` +
        `Salesforce ID: ${data.leadId}\n` +
        `Attachments: ${data.attachmentsTransferred}/${attachments.length}`
      );
    } else {
      const error = await result.json();
      showError(`Transfer failed: ${error.message}`);
    }

  } catch (error) {
    console.error('Transfer error:', error);
    showError(`Unexpected error: ${error.message}`);
  }
}

async function transferLeadDirectlyToSalesforce(leadData, attachments) {
  const apiUrl = `${appConfig.apiBaseUrl}/salesforce/leads`;
  const orgId = localStorage.getItem('orgId') || 'default';

  const payload = {
    leadData: leadData,
    attachments: attachments
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Org-Id': orgId  // Critical for cross-origin auth
    },
    credentials: 'include',
    body: JSON.stringify(payload)
  });

  return response;
}
```

**Backend Transfer Handler:**
```javascript
// server.js
app.post('/api/salesforce/leads', async (req, res) => {
  try {
    // Get Salesforce connection
    const orgId = getCurrentOrgId(req);
    const conn = getConnection(orgId);

    if (!conn) {
      return res.status(401).json({
        message: 'Not connected to Salesforce'
      });
    }

    const { leadData, attachments = [] } = req.body;

    console.log('Creating lead with data:', leadData);

    // Remove null/undefined fields
    const processedLeadData = {};
    Object.keys(leadData).forEach(field => {
      const value = leadData[field];
      if (value !== null && value !== undefined) {
        processedLeadData[field] = value;
      }
    });

    // Validate lead data
    const validationResults = validateAndFixLeadData(processedLeadData);
    let validatedLeadData = validationResults.data;

    if (validationResults.errors.length > 0) {
      return res.status(400).json({
        message: 'Lead data validation failed',
        errors: validationResults.errors,
        warnings: validationResults.warnings
      });
    }

    // Fetch valid Lead fields from Salesforce metadata
    const validLeadFields = await fetchLeadObjectFields(conn);

    console.log("valide field", validLeadFields)

    let unknownFields = [];
    if (validLeadFields) {
      // Filter out unknown fields
      unknownFields = Object.keys(validatedLeadData)
        .filter(field => !validLeadFields.has(field));

        console.log("unknow field", unknownFields)
  

      if (unknownFields.length > 0) {
        unknownFields.forEach(field => {
          delete validatedLeadData[field];
        });
        validationResults.warnings.push(
          `Removed unknown Lead fields: ${unknownFields.join(', ')}`
        );
      }
    }

    // Check for duplicates
    const duplicateQuery = `
      SELECT Id, FirstName, LastName, Company, Email
      FROM Lead
      WHERE LastName = '${validatedLeadData.LastName.replace(/'/g, "\\'")}'
      AND Company = '${validatedLeadData.Company.replace(/'/g, "\\'")}'
      LIMIT 1
    `;

    const duplicateResult = await conn.query(duplicateQuery);

    if (duplicateResult.records.length > 0) {
      const existing = duplicateResult.records[0];
      return res.status(409).json({
        message: 'Duplicate lead found',
        salesforceId: existing.Id,
        existingLead: {
          name: `${existing.FirstName || ''} ${existing.LastName}`.trim(),
          company: existing.Company,
          email: existing.Email
        }
      });
    }

    // Create the lead
    const leadResult = await conn.sobject('Lead').create(validatedLeadData);

    if (!leadResult.success) {
      let detailedError = 'Failed to create lead';
      if (leadResult.errors?.length > 0) {
        detailedError += ': ' + leadResult.errors
          .map(e => e.message || JSON.stringify(e))
          .join('; ');
      }

      return res.status(400).json({
        message: detailedError,
        salesforceErrors: leadResult.errors
      });
    }

    console.log('Lead created successfully:', leadResult.id);

    // Transfer attachments
    const attachmentResults = [];
    for (const attachment of attachments) {
      try {
        const sfAttachment = {
          Name: attachment.Name,
          Body: attachment.Body,
          ContentType: attachment.ContentType,
          ParentId: leadResult.id
        };

        const attResult = await conn.sobject('Attachment').create(sfAttachment);

        attachmentResults.push({
          name: attachment.Name,
          success: attResult.success,
          salesforceId: attResult.id
        });

      } catch (attError) {
        console.error(`Attachment error for ${attachment.Name}:`, attError);
        attachmentResults.push({
          name: attachment.Name,
          success: false,
          error: attError.message
        });
      }
    }

    // Return success response
    res.json({
      success: true,
      message: 'Lead transferred successfully',
      salesforceId: leadResult.id,
      attachments: attachmentResults,
      validationWarnings: validationResults.warnings
    });

  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({
      message: 'Server error during transfer',
      error: error.message
    });
  }
});
```

---

## Error Handling

### Error Types

1. **Authentication Errors**
   - Invalid credentials (LeadSuccess)
   - Expired OAuth token (Salesforce)
   - Missing connection

2. **Validation Errors**
   - Required fields missing
   - Invalid field formats
   - Unknown field names

3. **Duplicate Detection**
   - Matching LastName + Company
   - User confirmation required

4. **Transfer Errors**
   - Network failures
   - Salesforce API errors
   - Attachment upload failures

### Error Handling Implementation

```javascript
// Error Display
function showError(message) {
  const errorElement = document.getElementById("errorMessage");
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = "block";

    setTimeout(() => {
      errorElement.style.display = "none";
    }, 5000);
  }
}

// Field-specific errors
function showFieldError(fieldName, errorMessage) {
  const fieldContainer = document.querySelector(`[data-field-name="${fieldName}"]`);
  if (!fieldContainer) return;

  const errorElement = document.createElement('div');
  errorElement.className = 'field-error show';
  errorElement.textContent = errorMessage;
  fieldContainer.appendChild(errorElement);

  setTimeout(() => {
    errorElement.remove();
  }, 5000);
}

// Validation errors in modal
function showValidationErrors(errors) {
  const errorList = errors.map(err => `• ${err}`).join('\n');

  alert(
    `Cannot transfer lead. Please fix the following issues:\n\n${errorList}`
  );
}
```

---

## API Reference

### LeadSuccess API Endpoints

#### Get Leads by Event
```
GET LS_Lead?$filter=EventId eq '{eventId}'&$format=json

Response:
{
  d: {
    results: [
      {
        Id: "string",
        FirstName: "string",
        LastName: "string",
        Email: "string",
        Company: "string",
        ...
      }
    ]
  }
}
```

#### Get Lead Report
```
GET LS_LeadReport?$filter=EventId eq '{eventId}'&$format=json

Response: Same as LS_Lead
```

#### Get Attachment by ID
```
GET LS_AttachmentById?Id='{attachmentId}'&$format=json

Response:
{
  d: {
    Id: "string",
    Name: "string",
    ContentType: "string",
    Body: "base64string",
    BodyLength: number
  }
}
```

#### Save Field Mapping
```
POST LS_SFFieldMapping

Body:
{
  Id: "uuid",
  EventId: "string",
  FieldName: "string",
  CustomLabel: "string",
  IsActive: boolean,
  CreatedDate: "/Date(timestamp)/"
}

Response:
{
  d: { ...created record }
}
```

### Backend API Endpoints

#### Salesforce Authentication
```
GET /api/salesforce/auth

Response:
{
  url: "https://login.salesforce.com/services/oauth2/authorize?..."
}
```

#### Check Connection Status
```
GET /api/salesforce/check
Headers: X-Org-Id: {orgId}

Response:
{
  connected: true,
  userInfo: {
    display_name: "string",
    username: "string",
    organization_name: "string",
    organization_id: "string"
  }
}
```

#### Transfer Lead
```
POST /api/salesforce/leads
Headers:
  X-Org-Id: {orgId}
  Content-Type: application/json

Body:
{
  leadData: {
    FirstName: "string",
    LastName: "string",
    Email: "string",
    Company: "string",
    ...
  },
  attachments: [
    {
      Name: "string",
      Body: "base64string",
      ContentType: "string"
    }
  ]
}

Response (Success):
{
  success: true,
  message: "Lead transferred successfully",
  salesforceId: "00Q...",
  attachments: [
    {
      name: "file.pdf",
      success: true,
      salesforceId: "00P..."
    }
  ],
  validationWarnings: []
}

Response (Error):
{
  message: "Error description",
  errors: ["error1", "error2"],
  salesforceErrors: [...]
}
```

#### Logout
```
POST /api/logout

Response:
{
  message: "Logged out successfully"
}
```

---

## Configuration Files

### Environment Variables (.env)
```bash
# Server
PORT=3000
NODE_ENV=production

# Salesforce OAuth (optional defaults)
SF_CLIENT_ID=your_consumer_key
SF_CLIENT_SECRET=your_consumer_secret
SF_REDIRECT_URI_PRODUCTION=https://your-backend.azurewebsites.net/oauth/callback
SF_REDIRECT_URI_DEV=http://localhost:3000/oauth/callback
SF_LOGIN_URL=https://login.salesforce.com

# Session
SESSION_SECRET=your_super_secret_key_change_this_in_production
```

### Frontend Configuration (salesforceConfig.js)
```javascript
class SalesforceConfig {
  constructor() {
    this.isProduction = this.detectEnvironment();
  }

  detectEnvironment() {
    const hostname = window.location.hostname;
    return hostname.includes('azurestaticapps.net') ||
           hostname.includes('convey.de');
  }

  get apiBaseUrl() {
    if (this.isProduction) {
      return 'https://lsapisfbackenddev-gnfbema5gcaxdahz.germanywestcentral-01.azurewebsites.net/api';
    }
    return 'http://localhost:3000/api';
  }

  get oauthCallbackUrl() {
    if (this.isProduction) {
      return 'https://lsapisfbackenddev-gnfbema5gcaxdahz.germanywestcentral-01.azurewebsites.net/oauth/callback';
    }
    return 'http://localhost:3000/oauth/callback';
  }
}
```

---

## Troubleshooting

### Common Issues

#### 1. 401 Not Connected Error
**Symptoms**: "Not connected to Salesforce" during transfer

**Causes**:
- Session expired
- Missing X-Org-Id header
- Cookie not sent in cross-origin request

**Solutions**:
```javascript
// Ensure X-Org-Id header is sent
fetch('/api/salesforce/leads', {
  headers: {
    'X-Org-Id': localStorage.getItem('orgId') || 'default'
  },
  credentials: 'include'
});

// Check if still connected
const response = await fetch('/api/salesforce/check', {
  credentials: 'include'
});
```

#### 2. Unknown Field Errors
**Symptoms**: "No such column 'FieldName__c' on sobject"

**Causes**:
- Field doesn't exist in Salesforce
- Typo in custom label
- Wrong field API name

**Solutions**:
- Verify field exists in Salesforce Setup
- Check custom label matches SF field API name exactly
- Use Field Mapping UI to set correct names

#### 3. Duplicate Detection
**Symptoms**: "Duplicate lead found"

**Note**: Duplicate check is based on **LastName + Company**, not Email

**Solutions**:
- Change LastName or Company
- Or confirm to proceed with duplicate

#### 4. Attachment Upload Failures
**Symptoms**: "Attachment transfer failed"

**Causes**:
- Invalid Base64 encoding
- File too large (>25MB for Salesforce Attachments)
- Invalid content type

**Solutions**:
```javascript
// Verify Base64 is clean
processedBody = attachmentData.Body.replace(/\s+/g, '');

// Check file size
if (attachment.BodyLength > 25 * 1024 * 1024) {
  console.warn('File too large for Salesforce Attachment');
}

// Use correct content type
const mimeTypes = {
  'pdf': 'application/pdf',
  'jpg': 'image/jpeg',
  'png': 'image/png'
};
```

---

## Best Practices

### 1. Field Mapping
- Use standard Salesforce field names when possible
- Custom fields must end with `__c`
- Test field mappings before bulk transfers
- Keep field names simple and descriptive

### 2. Error Handling
- Always validate before transfer
- Show clear error messages to users
- Log errors for debugging
- Gracefully handle partial failures

### 3. Performance
- Cache field metadata
- Batch attachment transfers
- Use database persistence for mappings
- Minimize API calls

### 4. Security
- Never store credentials in localStorage
- Use HTTPS in production
- Validate all user input
- Implement proper session management

### 5. Data Integrity
- Validate required fields
- Check for duplicates
- Preserve data types
- Handle null values appropriately

---

## Glossary

**Base64**: Binary-to-text encoding scheme for attachments

**Custom Field**: Salesforce field created by user, ends with `__c`

**Field Mapping**: Associating LeadSuccess fields with Salesforce fields

**OAuth 2.0**: Authorization framework for Salesforce authentication

**OData**: Open Data Protocol used by LeadSuccess API

**Org ID**: Salesforce organization identifier

**Session Storage**: Browser storage cleared on tab close

**Local Storage**: Browser storage persisted across sessions

**System Fields**: Read-only fields managed by Salesforce (Id, CreatedDate, etc.)

---

## Maintenance

### Regular Tasks
1. Monitor error logs
2. Update field mappings as SF schema changes
3. Test OAuth flow after SF updates
4. Review and clean up old localStorage data
5. Update API documentation

### Version Updates
- Backend: Update `package.json` dependencies
- Frontend: Review browser compatibility
- Salesforce: Test after seasonal releases

---

## Support & Resources

**Salesforce Documentation**:
- [REST API Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/)
- [OAuth 2.0 Web Server Flow](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm)
- [Lead Object Reference](https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_lead.htm)

**jsforce Documentation**:
- [jsforce GitHub](https://github.com/jsforce/jsforce)
- [Connection & Authentication](https://jsforce.github.io/document/#connection)

**LeadSuccess API**:
- Contact your LeadSuccess administrator for API documentation

---

**Document Version**: 1.0
**Last Updated**: 2025-02-28
**Author**: Development Team
