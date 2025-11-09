# OAuth Web Server Flow - Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [OAuth Web Server Flow](#oauth-web-server-flow)
4. [Step-by-Step Guide](#step-by-step-guide)
5. [Token Management](#token-management)
6. [Using Tokens with Salesforce APIs](#using-tokens-with-salesforce-apis)
7. [Postman Collection - Complete API Reference](#postman-collection---complete-api-reference)
8. [Backend Integration](#backend-integration)
9. [Frontend Integration](#frontend-integration)
10. [Security Best Practices](#security-best-practices)
11. [Troubleshooting](#troubleshooting)

---

## Overview

The OAuth 2.0 Web Server Flow is the recommended authentication method for Salesforce integrations. It provides secure, token-based authentication without requiring users to share their passwords with third-party applications.

### Why OAuth Web Server Flow?

✅ **Secure** - No password storage required
✅ **Token-based** - Access and refresh tokens with expiration
✅ **User consent** - Users explicitly authorize access
✅ **Revocable** - Tokens can be revoked anytime
✅ **Multi-org support** - Each org has separate tokens

---

## Prerequisites

### 1. Salesforce Connected App

**Setup Steps:**
1. Login to Salesforce → **Setup**
2. Search for **"App Manager"**
3. Click **"New Connected App"**
4. Fill in:
   ```
   Connected App Name: LeadSuccess API
   API Name: LeadSuccess_API
   Contact Email: your@email.com

   ✅ Enable OAuth Settings

   Callback URL (one per line):
     https://oauth.pstmn.io/v1/callback
     http://localhost:3000/oauth/callback
     https://your-production-backend.azurewebsites.net/oauth/callback

   Selected OAuth Scopes:
     ✓ Access and manage your data (api)
     ✓ Perform requests on your behalf at any time (refresh_token, offline_access)
     ✓ Access your basic information (id, profile, email, address, phone)
     ✓ Access content resources (content)
     ✓ Provide access to custom permissions (custom_permissions)
   ```

5. **Save** → **Continue**
6. Copy **Consumer Key** (Client ID) and **Consumer Secret**

---

### 2. Environment Variables

**Salesforce Credentials:**
```
Client ID: 3MVG9rZjd7MXFdLjcmv2WrBcFvYgqfMxJzyW7.osW1KAWiHjC4Oh_C31c_DOCfKp0d.knPO6fvApDr8Y5qfgl
Client Secret: D638DD0A7C0DD06A57DAE136320DD52317D99F54FF9D8886725F7ADC420F356AD
Instance URL: https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com
```

---

## OAuth Web Server Flow

### Flow Diagram

```
┌─────────────────┐
│   User Browser  │
└────────┬────────┘
         │
         │ 1. Authorization Request
         │    GET /services/oauth2/authorize
         │
┌────────▼──────────────────────┐
│  Salesforce Login Page        │
│  User authenticates           │
└────────┬──────────────────────┘
         │
         │ 2. Redirect with Authorization Code
         │    ?code=aPrx.ppuB8Ul...
         │
┌────────▼────────────────────┐
│  Application Backend        │
└────────┬────────────────────┘
         │
         │ 3. Token Request
         │    POST /services/oauth2/token
         │    Body: code, client_id, client_secret
         │
┌────────▼──────────────────────┐
│  Salesforce Token Endpoint    │
└────────┬──────────────────────┘
         │
         │ 4. Access Token + Refresh Token
         │
┌────────▼────────────────────┐
│  Application                │
│  Stores tokens              │
│  Makes API requests         │
└─────────────────────────────┘
```

---

## Step-by-Step Guide

### **Step 1: Get Authorization Code**

**Purpose:** Redirect user to Salesforce to authorize the application.

**Request:**
```http
GET https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com/services/oauth2/authorize

Query Parameters:
  response_type: code
  client_id: 3MVG9rZjd7MXFdLjcmv2WrBcFvYgqfMxJzyW7.osW1KAWiHjC4Oh_C31c_DOCfKp0d.knPO6fvApDr8Y5qfgl
  redirect_uri: https://oauth.pstmn.io/v1/callback
  scope: api refresh_token (optional)
  state: random_string_for_csrf_protection (optional but recommended)
```

**Full URL Example:**
```
https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com/services/oauth2/authorize?response_type=code&client_id=3MVG9rZjd7MXFdLjcmv2WrBcFvYgqfMxJzyW7.osW1KAWiHjC4Oh_C31c_DOCfKp0d.knPO6fvApDr8Y5qfgl&redirect_uri=https://oauth.pstmn.io/v1/callback&scope=api%20refresh_token
```

**Action:**
1. Open this URL in a browser
2. User logs in to Salesforce
3. User clicks "Allow" to grant permissions

**Response:**
Salesforce redirects to:
```
https://oauth.pstmn.io/v1/callback?code=aPrx.ppuB8UlvcFbz9JJnoDvwpepT6Jm2cJfCExLnW4bpDMVQs9ceJCdVk.L_rfK52HYWAfvng%3D%3D
```

**⚠️ CRITICAL: URL Decoding Required**

The authorization code is **URL-encoded**. You MUST decode it before use.

**Encoded Code:**
```
aPrx.ppuB8UlvcFbz9JJnoDvwpepT6Jm2cJfCExLnW4bpDMVQs9ceJCdVk.L_rfK52HYWAfvng%3D%3D
```

**Decoded Code (use [URL Decoder](https://meyerweb.com/eric/tools/dencoder/)):**
```
aPrx.ppuB8UlvcFbz9JJnoDvwpepT6Jm2cJfCExLnW4bpDMVQs9ceJCdVk.L_rfK52HYWAfvng==
```

**Note:** `%3D` = `=` in URL encoding

---

### **Step 2: Exchange Code for Access Token**

**Purpose:** Exchange the authorization code for access and refresh tokens.

**⏰ Time Sensitive:** Authorization codes expire in **15 minutes** and can only be used **once**.

**Request:**
```http
POST https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com/services/oauth2/token

Headers:
  Content-Type: application/x-www-form-urlencoded

Body (form-data):
  grant_type: authorization_code
  code: aPrx.ppuB8UlvcFbz9JJnoDvwpepT6Jm2cJfCExLnW4bpDMVQs9ceJCdVk.L_rfK52HYWAfvng==
  client_id: 3MVG9rZjd7MXFdLjcmv2WrBcFvYgqfMxJzyW7.osW1KAWiHjC4Oh_C31c_DOCfKp0d.knPO6fvApDr8Y5qfgl
  client_secret: D638DD0A7C0DD06A57DAE136320DD52317D99F54FF9D8886725F7ADC420F356AD
  redirect_uri: https://oauth.pstmn.io/v1/callback
  format: json
```

**Response (200 OK):**
```json
{
  "access_token": "00DgK000000OMLx!AQEAQFLA6K3vv6dDaHV5UpAv4UHHPTh1K3D486u4pjy.23CXKWr_jAtZxpOWHne2iWYIiAp8Z8EbfNDvHYL19I1F4yOdiRba",
  "refresh_token": "5Aep8612EC5NxGKVYoh_lSVjgYt_fJeZ.G6A7wjrfXm8hi3GjrpVdX.GcApg5Dll0Z5llZFr..7xgbSY2NlXo3J",
  "signature": "You61JcneIFtr+ZcnG0tMfLsSafKVFg7vE95TW/i0Ck=",
  "scope": "lightning refresh_token web openid api id",
  "id_token": "eyJraWQiOiIyNTYiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
  "instance_url": "https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com",
  "id": "https://login.salesforce.com/id/00DgK000000OMLxUAO/005gK000000TSnJQAW",
  "token_type": "Bearer",
  "issued_at": "1759828104619"
}
```

---

## Token Management

### Token Types

| Token | Purpose | Expiration | Storage |
|-------|---------|------------|---------|
| **Access Token** | Authenticate API requests | 2 hours (default) | Server-side session/memory |
| **Refresh Token** | Obtain new access tokens | Never (until revoked) | Encrypted database |
| **ID Token** | JWT with user identity | N/A (for verification) | Optional |

### Token Details

**Access Token:**
```
00DgK000000OMLx!AQEAQFLA6K3vv6dDaHV5UpAv4UHHPTh1K3D486u4pjy.23CXKWr_jAtZxpOWHne2iWYIiAp8Z8EbfNDvHYL19I1F4yOdiRba
```

**Format:** `{OrgId}!{SessionId}`
- `00DgK000000OMLx` = Organization ID
- Everything after `!` = Session identifier

**Refresh Token:**
```
5Aep8612EC5NxGKVYoh_lSVjgYt_fJeZ.G6A7wjrfXm8hi3GjrpVdX.GcApg5Dll0Z5llZFr..7xgbSY2NlXo3J
```

**Instance URL:**
```
https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com
```
Use this as the base URL for all Salesforce API requests.

**ID (Identity URL):**
```
https://login.salesforce.com/id/00DgK000000OMLxUAO/005gK000000TSnJQAW
```
Format: `https://login.salesforce.com/id/{OrgId}/{UserId}`

---

### Refresh Token Flow

When the access token expires, use the refresh token to obtain a new one.

**Request:**
```http
POST https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com/services/oauth2/token

Headers:
  Content-Type: application/x-www-form-urlencoded

Body (form-data):
  grant_type: refresh_token
  refresh_token: 5Aep8612EC5NxGKVYoh_lSVjgYt_fJeZ.G6A7wjrfXm8hi3GjrpVdX.GcApg5Dll0Z5llZFr..7xgbSY2NlXo3J
  client_id: 3MVG9rZjd7MXFdLjcmv2WrBcFvYgqfMxJzyW7.osW1KAWiHjC4Oh_C31c_DOCfKp0d.knPO6fvApDr8Y5qfgl
  client_secret: D638DD0A7C0DD06A57DAE136320DD52317D99F54FF9D8886725F7ADC420F356AD
  format: json
```

**Response (200 OK):**
```json
{
  "access_token": "NEW_ACCESS_TOKEN_HERE",
  "signature": "...",
  "scope": "lightning refresh_token web openid api id",
  "instance_url": "https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com",
  "id": "https://login.salesforce.com/id/00DgK000000OMLxUAO/005gK000000TSnJQAW",
  "token_type": "Bearer",
  "issued_at": "1759828500000"
}
```

**Note:** The refresh token is NOT returned again. Store it securely.

---

### Revoke Token

To logout or revoke access:

**Request:**
```http
POST https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com/services/oauth2/revoke

Headers:
  Content-Type: application/x-www-form-urlencoded

Body (form-data):
  token: {access_token or refresh_token}
```

**Response:**
```
200 OK (empty body)
```

---

## Using Tokens with Salesforce APIs

### Authentication Header

All Salesforce API requests require the access token in the `Authorization` header:

```http
Authorization: Bearer 00DgK000000OMLx!AQEAQFLA6K3vv6dDaHV5UpAv4UHHPTh1K3D486u4pjy.23CXKWr_jAtZxpOWHne2iWYIiAp8Z8EbfNDvHYL19I1F4yOdiRba
```

---

## Postman Collection - Complete API Reference

### Collection Structure

```
📁 Salesforce OAuth & API Tests
  📂 1. Authentication
    ├─ 1.1 Get Authorization Code (Manual)
    ├─ 1.2 Exchange Code for Token
    ├─ 1.3 Refresh Access Token
    ├─ 1.4 Get User Info
    └─ 1.5 Revoke Token

  📂 2. Metadata & Discovery
    ├─ 2.1 List All Objects
    ├─ 2.2 Describe Lead Object
    ├─ 2.3 Describe Custom Object
    ├─ 2.4 Get Organization Info
    └─ 2.5 List Custom Fields

  📂 3. Lead CRUD Operations
    ├─ 3.1 Query Leads (SOQL)
    ├─ 3.2 Get Lead by ID
    ├─ 3.3 Create Lead
    ├─ 3.4 Update Lead
    ├─ 3.5 Delete Lead
    └─ 3.6 Upsert Lead

  📂 4. Custom Fields (Tooling API)
    ├─ 4.1 Describe Custom Field
    ├─ 4.2 Create Text Field
    ├─ 4.3 Create Number Field
    ├─ 4.4 Create Picklist Field
    ├─ 4.5 Create Checkbox Field
    └─ 4.6 Delete Custom Field

  📂 5. Attachments & Files
    ├─ 5.1 Upload Attachment (Classic)
    ├─ 5.2 Upload ContentVersion (Lightning)
    ├─ 5.3 Link File to Record
    └─ 5.4 Query Attachments

  📂 6. Duplicate Detection
    ├─ 6.1 Find Duplicate Leads
    └─ 6.2 Merge Duplicate Records

  📂 7. Bulk Operations
    ├─ 7.1 Bulk Query Leads
    └─ 7.2 Bulk Create Leads
```

---

### 1. Authentication

#### 1.1 Get Authorization Code (Manual)

**Method:** `GET` (Browser)

**URL:**
```
https://{{instance_url}}/services/oauth2/authorize?response_type=code&client_id={{client_id}}&redirect_uri={{redirect_uri}}&scope=api%20refresh_token
```

**Instructions:**
1. Copy the URL
2. Replace variables with actual values
3. Open in browser
4. Login to Salesforce
5. Copy the `code` parameter from redirect URL
6. URL-decode the code before using

---

#### 1.2 Exchange Code for Token

**Method:** `POST`

**URL:**
```
https://{{instance_url}}/services/oauth2/token
```

**Headers:**
```
Content-Type: application/x-www-form-urlencoded
```

**Body (x-www-form-urlencoded):**
```
grant_type: authorization_code
code: {{authorization_code}}
client_id: {{client_id}}
client_secret: {{client_secret}}
redirect_uri: {{redirect_uri}}
format: json
```

**Response:**
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "instance_url": "...",
  "id": "...",
  "token_type": "Bearer",
  "issued_at": "..."
}
```

**Post-Response Script (Postman):**
```javascript
// Save tokens to environment
const response = pm.response.json();
pm.environment.set("access_token", response.access_token);
pm.environment.set("refresh_token", response.refresh_token);
pm.environment.set("instance_url", response.instance_url);
```

---

#### 1.3 Refresh Access Token

**Method:** `POST`

**URL:**
```
https://{{instance_url}}/services/oauth2/token
```

**Headers:**
```
Content-Type: application/x-www-form-urlencoded
```

**Body (x-www-form-urlencoded):**
```
grant_type: refresh_token
refresh_token: {{refresh_token}}
client_id: {{client_id}}
client_secret: {{client_secret}}
format: json
```

**Response:**
```json
{
  "access_token": "NEW_TOKEN",
  "instance_url": "...",
  "id": "...",
  "token_type": "Bearer",
  "issued_at": "..."
}
```

---

#### 1.4 Get User Info

**Method:** `GET`

**URL:**
```
https://{{instance_url}}/services/oauth2/userinfo
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Response:**
```json
{
  "sub": "https://login.salesforce.com/id/00D.../005...",
  "user_id": "005gK000000TSnJQAW",
  "organization_id": "00DgK000000OMLxUAO",
  "preferred_username": "maxim243@agentforce.com",
  "nickname": "User17416044580156309249",
  "name": "Maxim Kemajou",
  "email": "maxim@convey.de",
  "email_verified": true,
  "given_name": "Maxim",
  "family_name": "Kemajou",
  "zoneinfo": "Europe/Berlin",
  "photos": {
    "picture": "https://...",
    "thumbnail": "https://..."
  },
  "profile": "https://...",
  "phone_number": "+49 17640566784",
  "phone_number_verified": true,
  "address": {},
  "is_salesforce_integration_user": false,
  "urls": {
    "enterprise": "https://.../services/Soap/c/{version}/00DgK...",
    "metadata": "https://.../services/Soap/m/{version}/00DgK...",
    "partner": "https://.../services/Soap/u/{version}/00DgK...",
    "rest": "https://.../services/data/v{version}/",
    "sobjects": "https://.../services/data/v{version}/sobjects/",
    "search": "https://.../services/data/v{version}/search/",
    "query": "https://.../services/data/v{version}/query/",
    "recent": "https://.../services/data/v{version}/recent/",
    "tooling_soap": "https://.../services/Soap/T/{version}/00DgK...",
    "tooling_rest": "https://.../services/data/v{version}/tooling/",
    "profile": "https://.../005gK000000TSnJQAW",
    "feeds": "https://.../services/data/v{version}/chatter/feeds",
    "groups": "https://.../services/data/v{version}/chatter/groups",
    "users": "https://.../services/data/v{version}/chatter/users",
    "feed_items": "https://.../services/data/v{version}/chatter/feed-items",
    "feed_elements": "https://.../services/data/v{version}/chatter/feed-elements",
    "custom_domain": "https://..."
  },
  "active": true,
  "user_type": "STANDARD",
  "language": "en_US",
  "locale": "fr_FR",
  "utcOffset": 3600000,
  "updated_at": "2025-09-28T09:30:18Z",
  "is_app_installed": true
}
```

---

#### 1.5 Revoke Token

**Method:** `POST`

**URL:**
```
https://{{instance_url}}/services/oauth2/revoke
```

**Headers:**
```
Content-Type: application/x-www-form-urlencoded
```

**Body (x-www-form-urlencoded):**
```
token: {{access_token}}
```

**Response:**
```
200 OK (no body)
```

---

### 2. Metadata & Discovery

#### 2.1 List All Objects

**Method:** `GET`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/sobjects
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Response:**
```json
{
  "encoding": "UTF-8",
  "maxBatchSize": 200,
  "sobjects": [
    {
      "name": "Account",
      "label": "Account",
      "custom": false,
      "keyPrefix": "001",
      "queryable": true,
      "createable": true,
      "updateable": true,
      "deleteable": true
    },
    {
      "name": "Lead",
      "label": "Lead",
      "custom": false,
      "keyPrefix": "00Q",
      "queryable": true,
      "createable": true,
      "updateable": true,
      "deleteable": true
    }
  ]
}
```

---

#### 2.2 Describe Lead Object

**Method:** `GET`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/sobjects/Lead/describe
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Response:**
```json
{
  "name": "Lead",
  "label": "Lead",
  "labelPlural": "Leads",
  "keyPrefix": "00Q",
  "custom": false,
  "createable": true,
  "updateable": true,
  "deleteable": true,
  "queryable": true,
  "fields": [
    {
      "name": "Id",
      "type": "id",
      "label": "Lead ID",
      "custom": false,
      "createable": false,
      "updateable": false,
      "nillable": false,
      "unique": true
    },
    {
      "name": "FirstName",
      "type": "string",
      "label": "First Name",
      "custom": false,
      "createable": true,
      "updateable": true,
      "nillable": true,
      "length": 40
    },
    {
      "name": "LastName",
      "type": "string",
      "label": "Last Name",
      "custom": false,
      "createable": true,
      "updateable": true,
      "nillable": false,
      "length": 80
    },
    {
      "name": "Email",
      "type": "email",
      "label": "Email",
      "custom": false,
      "createable": true,
      "updateable": true,
      "nillable": true,
      "length": 80
    },
    {
      "name": "Company",
      "type": "string",
      "label": "Company",
      "custom": false,
      "createable": true,
      "updateable": true,
      "nillable": false,
      "length": 255
    },
    {
      "name": "Question01__c",
      "type": "string",
      "label": "Question 01",
      "custom": true,
      "createable": true,
      "updateable": true,
      "nillable": true,
      "length": 255
    }
  ],
  "recordTypeInfos": []
}
```

**Use Case:** Check which fields exist before creating custom fields.

---

#### 2.3 Describe Custom Object

**Method:** `GET`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/sobjects/CustomObject__c/describe
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

---

#### 2.4 Get Organization Info

**Method:** `GET`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/query?q=SELECT Id, Name, OrganizationType, InstanceName, IsSandbox FROM Organization
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Response:**
```json
{
  "totalSize": 1,
  "done": true,
  "records": [
    {
      "attributes": {
        "type": "Organization",
        "url": "/services/data/v59.0/sobjects/Organization/00DgK000000OMLxUAO"
      },
      "Id": "00DgK000000OMLxUAO",
      "Name": "Convey",
      "OrganizationType": "Developer Edition",
      "InstanceName": "orgfarm-0fb60c8e1f-dev-ed",
      "IsSandbox": false
    }
  ]
}
```

---

#### 2.5 List Custom Fields

**Method:** `GET`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/tooling/query?q=SELECT Id, DeveloperName, TableEnumOrId FROM CustomField WHERE TableEnumOrId = 'Lead'
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Response:**
```json
{
  "size": 5,
  "totalSize": 5,
  "done": true,
  "records": [
    {
      "attributes": {
        "type": "CustomField",
        "url": "/services/data/v59.0/tooling/sobjects/CustomField/00N..."
      },
      "Id": "00N...",
      "DeveloperName": "Question01",
      "TableEnumOrId": "Lead"
    }
  ]
}
```

---

### 3. Lead CRUD Operations

#### 3.1 Query Leads (SOQL)

**Method:** `GET`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/query?q=SELECT Id, FirstName, LastName, Email, Company, Status FROM Lead WHERE Email != null LIMIT 10
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Response:**
```json
{
  "totalSize": 10,
  "done": true,
  "records": [
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v59.0/sobjects/Lead/00Q..."
      },
      "Id": "00Q5g000001234567",
      "FirstName": "John",
      "LastName": "Doe",
      "Email": "john.doe@example.com",
      "Company": "Acme Corporation",
      "Status": "Open - Not Contacted"
    }
  ]
}
```

---

#### 3.2 Get Lead by ID

**Method:** `GET`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/sobjects/Lead/{{lead_id}}
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Response:**
```json
{
  "attributes": {
    "type": "Lead",
    "url": "/services/data/v59.0/sobjects/Lead/00Q..."
  },
  "Id": "00Q5g000001234567",
  "FirstName": "John",
  "LastName": "Doe",
  "Email": "john.doe@example.com",
  "Company": "Acme Corporation",
  "Phone": "+1234567890",
  "Status": "Open - Not Contacted",
  "CreatedDate": "2025-01-15T10:30:00.000+0000",
  "LastModifiedDate": "2025-01-20T14:45:00.000+0000"
}
```

---

#### 3.3 Create Lead

**Method:** `POST`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/sobjects/Lead
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "FirstName": "Jane",
  "LastName": "Smith",
  "Email": "jane.smith@example.com",
  "Company": "Tech Innovations Inc",
  "Phone": "+1987654321",
  "Status": "Open - Not Contacted",
  "LeadSource": "Web",
  "Title": "CTO",
  "Industry": "Technology"
}
```

**Response (201 Created):**
```json
{
  "id": "00Q5g000001ABCDEF",
  "success": true,
  "errors": []
}
```

---

#### 3.4 Update Lead

**Method:** `PATCH`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/sobjects/Lead/{{lead_id}}
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "Status": "Working - Contacted",
  "Phone": "+1555000999",
  "Rating": "Hot"
}
```

**Response (204 No Content):**
```
(empty body - success)
```

---

#### 3.5 Delete Lead

**Method:** `DELETE`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/sobjects/Lead/{{lead_id}}
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Response (204 No Content):**
```
(empty body - success)
```

---

#### 3.6 Upsert Lead

**Method:** `PATCH`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/sobjects/Lead/Email/jane.smith@example.com
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "FirstName": "Jane",
  "LastName": "Smith",
  "Company": "Tech Innovations Inc",
  "Status": "Working - Contacted"
}
```

**Response:**
- **201 Created** if new record
- **204 No Content** if updated existing

---

### 4. Custom Fields (Tooling API)

#### 4.1 Describe Custom Field

**Method:** `GET`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/tooling/sobjects/CustomField/describe
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

---

#### 4.2 Create Text Field

**Method:** `POST`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/tooling/sobjects/CustomField
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "FullName": "Lead.Question01__c",
  "Metadata": {
    "type": "Text",
    "label": "Question 01",
    "length": 255,
    "required": false,
    "unique": false,
    "externalId": false,
    "description": "Custom question field for lead qualification"
  }
}
```

**Response (201 Created):**
```json
{
  "id": "00N5g00000...",
  "success": true,
  "errors": []
}
```

**Common Field Types:**
- `Text` - Text field (specify length)
- `LongTextArea` - Long text area (specify length, visibleLines)
- `Number` - Number field (specify precision, scale)
- `Checkbox` - Boolean (specify defaultValue)
- `Picklist` - Dropdown (specify picklist values)
- `Date` - Date field
- `DateTime` - Date/Time field
- `Email` - Email field
- `Phone` - Phone field
- `Url` - URL field
- `Currency` - Currency field (specify precision, scale)
- `Percent` - Percentage field

---

#### 4.3 Create Number Field

**Method:** `POST`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/tooling/sobjects/CustomField
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "FullName": "Lead.Score__c",
  "Metadata": {
    "type": "Number",
    "label": "Lead Score",
    "precision": 18,
    "scale": 0,
    "required": false,
    "unique": false,
    "externalId": false,
    "description": "Numeric score for lead qualification"
  }
}
```

---

#### 4.4 Create Picklist Field

**Method:** `POST`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/tooling/sobjects/CustomField
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "FullName": "Lead.Priority__c",
  "Metadata": {
    "type": "Picklist",
    "label": "Priority",
    "required": false,
    "description": "Lead priority level",
    "picklist": {
      "picklistValues": [
        {
          "fullName": "High",
          "default": false
        },
        {
          "fullName": "Medium",
          "default": true
        },
        {
          "fullName": "Low",
          "default": false
        }
      ],
      "sorted": false
    }
  }
}
```

---

#### 4.5 Create Checkbox Field

**Method:** `POST`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/tooling/sobjects/CustomField
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "FullName": "Lead.IsQualified__c",
  "Metadata": {
    "type": "Checkbox",
    "label": "Is Qualified",
    "defaultValue": false,
    "required": false,
    "description": "Indicates if lead is qualified"
  }
}
```

---

#### 4.6 Delete Custom Field

**Method:** `DELETE`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/tooling/sobjects/CustomField/{{field_id}}
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Response (204 No Content):**
```
(empty body - success)
```

**⚠️ Warning:** Deleting a custom field is permanent. Data will be lost.

---

### 5. Attachments & Files

#### 5.1 Upload Attachment (Classic)

**Method:** `POST`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/sobjects/Attachment
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "Name": "document.pdf",
  "Body": "JVBERi0xLjQKJeLjz9MKMyAwIG9iago8PC9UeXBlL...",
  "ContentType": "application/pdf",
  "ParentId": "00Q5g000001ABCDEF"
}
```

**Note:** `Body` must be Base64-encoded file content.

**Response (201 Created):**
```json
{
  "id": "00P5g00000...",
  "success": true,
  "errors": []
}
```

---

#### 5.2 Upload ContentVersion (Lightning)

**Method:** `POST`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/sobjects/ContentVersion
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "Title": "Lead Document",
  "PathOnClient": "document.pdf",
  "VersionData": "JVBERi0xLjQKJeLjz9MKMyAwIG9iago8PC9UeXBlL...",
  "FirstPublishLocationId": "00Q5g000001ABCDEF"
}
```

**Response (201 Created):**
```json
{
  "id": "0685g00000...",
  "success": true,
  "errors": []
}
```

---

#### 5.3 Link File to Record

**Method:** `POST`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/sobjects/ContentDocumentLink
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "ContentDocumentId": "0695g00000...",
  "LinkedEntityId": "00Q5g000001ABCDEF",
  "ShareType": "V",
  "Visibility": "AllUsers"
}
```

---

#### 5.4 Query Attachments

**Method:** `GET`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/query?q=SELECT Id, Name, ContentType, BodyLength FROM Attachment WHERE ParentId = '{{lead_id}}'
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

---

### 6. Duplicate Detection

#### 6.1 Find Duplicate Leads

**Method:** `GET`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/query?q=SELECT Id, FirstName, LastName, Email, Company FROM Lead WHERE LastName = 'Smith' AND Company = 'Acme Inc'
```

**Headers:**
```
Authorization: Bearer {{access_token}}
```

**Response:**
```json
{
  "totalSize": 2,
  "done": true,
  "records": [
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v59.0/sobjects/Lead/00Q..."
      },
      "Id": "00Q5g000001AAAA",
      "FirstName": "John",
      "LastName": "Smith",
      "Email": "john.smith@acme.com",
      "Company": "Acme Inc"
    },
    {
      "attributes": {
        "type": "Lead",
        "url": "/services/data/v59.0/sobjects/Lead/00Q..."
      },
      "Id": "00Q5g000001BBBB",
      "FirstName": "John",
      "LastName": "Smith",
      "Email": "j.smith@acme.com",
      "Company": "Acme Inc"
    }
  ]
}
```

---

#### 6.2 Merge Duplicate Records

**Note:** Lead merging is not directly supported via REST API. Use:
1. Convert duplicates to Contacts/Accounts
2. Use Salesforce UI or Apex for merging
3. Or delete duplicates after transferring data

---

### 7. Bulk Operations

#### 7.1 Bulk Query Leads

**Method:** `POST`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/jobs/query
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "operation": "query",
  "query": "SELECT Id, FirstName, LastName, Email, Company FROM Lead WHERE CreatedDate > LAST_N_DAYS:30"
}
```

**Response (200 OK):**
```json
{
  "id": "7505g00000...",
  "operation": "query",
  "object": "Lead",
  "createdById": "005...",
  "createdDate": "2025-01-20T10:00:00.000+0000",
  "systemModstamp": "2025-01-20T10:00:00.000+0000",
  "state": "UploadComplete",
  "concurrencyMode": "Parallel",
  "contentType": "CSV",
  "apiVersion": 59.0,
  "lineEnding": "LF",
  "columnDelimiter": "COMMA"
}
```

**Next Step:** Poll job status and retrieve results.

---

#### 7.2 Bulk Create Leads

**Method:** `POST`

**URL:**
```
https://{{instance_url}}/services/data/v59.0/jobs/ingest
```

**Headers:**
```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "object": "Lead",
  "operation": "insert",
  "contentType": "CSV"
}
```

**Response:** Returns job ID

**Next Step:** Upload CSV data with PUT request to the job.

---

## Backend Integration

Your application already has OAuth implementation. Here's how it works:

### Backend Flow (server.js)

**1. Generate Auth URL:**
```javascript
// POST /api/salesforce/auth
app.post('/api/salesforce/auth', (req, res) => {
  const { clientId, clientSecret, loginUrl } = req.body;

  const state = generateState();
  req.session.oauthState = state;
  req.session.clientCredentials = { clientId, clientSecret, loginUrl };

  const oauth2 = new jsforce.OAuth2({
    clientId,
    clientSecret,
    redirectUri: config.salesforce.redirectUri,
    loginUrl: loginUrl || 'https://login.salesforce.com'
  });

  const authUrl = oauth2.getAuthorizationUrl({
    scope: 'api refresh_token',
    state: state
  });

  res.json({ authUrl });
});
```

**2. Handle Callback:**
```javascript
// GET /oauth/callback
app.get('/oauth/callback', async (req, res) => {
  const { code, state } = req.query;

  // Validate state
  if (!state) {
    throw new Error('Invalid state parameter format');
  }

  const orgId = state.includes(':') ? state.split(':')[1] : 'default';

  // Exchange code for token
  const conn = new jsforce.Connection({ oauth2 });
  await conn.authorize(code);

  // Store connection
  req.session.salesforce = {
    accessToken: conn.accessToken,
    refreshToken: conn.refreshToken,
    instanceUrl: conn.instanceUrl
  };

  storeConnection({
    connection: conn,
    organizationId: orgId,
    userInfo: conn.userInfo
  });

  res.send('<html>...</html>'); // Success page
});
```

**3. Use Connection:**
```javascript
// POST /api/salesforce/leads
app.post('/api/salesforce/leads', async (req, res) => {
  const orgId = getCurrentOrgId(req);
  const conn = getConnection(orgId);

  if (!conn) {
    return res.status(401).json({ message: 'Not connected to Salesforce' });
  }

  const { leadData } = req.body;
  const result = await conn.sobject('Lead').create(leadData);

  res.json({ success: true, salesforceId: result.id });
});
```

---

## Frontend Integration

### Connect to Salesforce Button

```javascript
// displayLeadTransferController.js
async function handleConnectClick() {
  try {
    // Get auth URL from backend
    const response = await fetch(`${appConfig.apiBaseUrl}/salesforce/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        clientId: 'YOUR_CLIENT_ID',
        clientSecret: 'YOUR_CLIENT_SECRET'
      })
    });

    const { authUrl } = await response.json();

    // Open OAuth popup
    const popup = window.open(authUrl, 'Salesforce OAuth', 'width=600,height=700');

    // Listen for callback
    window.addEventListener('message', handleOAuthCallback);

  } catch (error) {
    console.error('OAuth error:', error);
    showError('Failed to connect to Salesforce');
  }
}

function handleOAuthCallback(event) {
  if (event.data.type === 'salesforce-oauth-success') {
    showSuccess('Connected to Salesforce!');
    checkSalesforceConnection();
  }
}
```

### Check Connection Status

```javascript
async function checkSalesforceConnection() {
  try {
    const response = await fetch(`${appConfig.apiBaseUrl}/salesforce/check`, {
      headers: {
        'X-Org-Id': localStorage.getItem('orgId') || 'default'
      },
      credentials: 'include'
    });

    const { connected, userInfo } = await response.json();

    if (connected) {
      updateUIConnected(userInfo);
    } else {
      updateUIDisconnected();
    }

  } catch (error) {
    console.error('Connection check error:', error);
  }
}
```

### Transfer Lead with OAuth

```javascript
async function transferLeadToSalesforce(leadData, attachments) {
  try {
    const response = await fetch(`${appConfig.apiBaseUrl}/salesforce/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Org-Id': localStorage.getItem('orgId') || 'default'
      },
      credentials: 'include',
      body: JSON.stringify({ leadData, attachments })
    });

    if (!response.ok) {
      throw new Error('Transfer failed');
    }

    const result = await response.json();
    showSuccess(`Lead transferred! SF ID: ${result.salesforceId}`);

  } catch (error) {
    console.error('Transfer error:', error);
    showError('Failed to transfer lead');
  }
}
```

---

## Security Best Practices

### ✅ DO:

1. **Use HTTPS in Production**
   - All OAuth flows must use HTTPS
   - Never use HTTP for production

2. **Store Tokens Server-Side**
   ```javascript
   // ✅ Good - server-side session
   req.session.salesforce = {
     accessToken: conn.accessToken,
     refreshToken: conn.refreshToken
   };

   // ❌ Bad - client-side storage
   localStorage.setItem('access_token', token); // XSS vulnerable
   ```

3. **Use httpOnly Cookies**
   ```javascript
   app.use(session({
     secret: process.env.SESSION_SECRET,
     cookie: {
       httpOnly: true,
       secure: true, // HTTPS only
       sameSite: 'none' // Cross-origin
     }
   }));
   ```

4. **Validate State Parameter**
   ```javascript
   const state = crypto.randomBytes(32).toString('hex');
   req.session.oauthState = state;

   // In callback
   if (req.query.state !== req.session.oauthState) {
     throw new Error('CSRF attack detected');
   }
   ```

5. **Implement Token Refresh**
   ```javascript
   async function ensureValidToken(conn) {
     try {
       await conn.identity();
     } catch (error) {
       if (error.errorCode === 'INVALID_SESSION_ID') {
         // Token expired, refresh it
         await conn.oauth2.refreshToken(conn.refreshToken);
       }
     }
   }
   ```

6. **Encrypt Refresh Tokens in Database**
   ```javascript
   const crypto = require('crypto');

   function encryptToken(token) {
     const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
     let encrypted = cipher.update(token, 'utf8', 'hex');
     encrypted += cipher.final('hex');
     return encrypted;
   }
   ```

7. **Set Appropriate Scopes**
   ```javascript
   // Only request what you need
   scope: 'api refresh_token' // Minimal access

   // Not
   scope: 'full' // Too broad
   ```

---

### ❌ DON'T:

1. **Don't Store Tokens in localStorage**
   - Vulnerable to XSS attacks
   - Accessible to JavaScript

2. **Don't Expose client_secret in Frontend**
   ```javascript
   // ❌ Bad
   const clientSecret = 'D638DD0A7C0DD06A57DAE136320DD52317D99F54FF9D8886725F7ADC420F356AD';
   ```

3. **Don't Use Password Flow in Production**
   - Deprecated by Salesforce
   - Requires storing user passwords

4. **Don't Skip Token Validation**
   ```javascript
   // ✅ Always validate
   if (!conn || !conn.accessToken) {
     return res.status(401).json({ message: 'Not authenticated' });
   }
   ```

5. **Don't Log Tokens**
   ```javascript
   // ❌ Bad
   console.log('Access token:', accessToken);

   // ✅ Good
   console.log('User authenticated:', userId);
   ```

6. **Don't Share Tokens Between Orgs**
   ```javascript
   // ✅ Separate connections per org
   const connections = new Map(); // orgId → connection
   ```

---

## Troubleshooting

### Common Errors

#### 1. `invalid_grant` - Invalid authorization code

**Cause:**
- Code expired (15 minutes)
- Code already used (single-use only)
- Code not URL-decoded

**Solution:**
1. Get a fresh authorization code
2. URL-decode the code before using
3. Exchange code immediately

---

#### 2. `invalid_client_id` - Client identifier invalid

**Cause:**
- Wrong Client ID
- Wrong login URL (production vs sandbox)
- Connected App not active

**Solution:**
1. Verify Client ID in Salesforce Connected App
2. Use correct login URL:
   - Production: `https://login.salesforce.com`
   - Sandbox: `https://test.salesforce.com`
   - Custom domain: `https://your-domain.my.salesforce.com`

---

#### 3. `redirect_uri_mismatch` - Redirect URI mismatch

**Cause:**
- Callback URL in request doesn't match Connected App setting
- URL encoding issues

**Solution:**
1. Go to Salesforce Setup → App Manager → Your Connected App
2. Add exact callback URL (including protocol, domain, port, path)
3. Ensure no trailing slashes mismatch

---

#### 4. `INVALID_SESSION_ID` - Session expired or invalid

**Cause:**
- Access token expired (2 hours default)
- Token revoked
- Org credentials changed

**Solution:**
1. Use refresh token to get new access token
2. Implement automatic token refresh

```javascript
try {
  await conn.query('SELECT Id FROM Account LIMIT 1');
} catch (error) {
  if (error.errorCode === 'INVALID_SESSION_ID') {
    await conn.oauth2.refreshToken(conn.refreshToken);
    // Retry request
  }
}
```

---

#### 5. Access token not working

**Symptoms:**
- 401 Unauthorized
- "Authentication required"

**Solution:**
1. Verify token format:
   ```
   Authorization: Bearer 00DgK000000OMLx!AQEAQ...
   ```
2. Check token hasn't expired
3. Ensure correct instance URL
4. Verify user has necessary permissions

---

#### 6. CORS errors in browser

**Symptoms:**
- "Access to fetch blocked by CORS policy"

**Solution:**
1. Make OAuth requests from backend, not frontend
2. Configure CORS in backend:
   ```javascript
   app.use(cors({
     origin: 'https://your-frontend.com',
     credentials: true
   }));
   ```

---

## Advanced Topics

### Multi-Org Support

Your application already supports multiple Salesforce orgs:

```javascript
// Store connections per org
const connections = new Map(); // orgId → connection

function storeConnection(sessionData) {
  const orgId = sessionData.organizationId || 'default';
  connections.set(orgId, {
    connection: sessionData.connection,
    userInfo: sessionData.userInfo,
    timestamp: Date.now()
  });
}

function getConnection(orgId) {
  const connData = connections.get(orgId);
  return connData ? connData.connection : null;
}

// Use in API endpoints
app.post('/api/salesforce/leads', async (req, res) => {
  const orgId = req.headers['x-org-id'] || 'default';
  const conn = getConnection(orgId);

  if (!conn) {
    return res.status(401).json({ message: 'Not connected' });
  }

  // Use connection...
});
```

---

### Token Expiration Handling

```javascript
class SalesforceConnection {
  constructor(oauth2, tokens) {
    this.oauth2 = oauth2;
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.instanceUrl = tokens.instanceUrl;
  }

  async ensureValidToken() {
    try {
      // Test token validity
      await this.query('SELECT Id FROM Account LIMIT 1');
    } catch (error) {
      if (error.errorCode === 'INVALID_SESSION_ID') {
        // Refresh token
        const result = await this.oauth2.refreshToken(this.refreshToken);
        this.accessToken = result.access_token;
        return result.access_token;
      }
      throw error;
    }
  }

  async query(soql) {
    await this.ensureValidToken();
    // Make query...
  }
}
```

---

### Refresh Token Rotation

Some Salesforce orgs have refresh token rotation enabled. Handle it:

```javascript
async function refreshAccessToken(conn) {
  const response = await fetch(`${conn.instanceUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: conn.refreshToken,
      client_id: conn.clientId,
      client_secret: conn.clientSecret
    })
  });

  const tokens = await response.json();

  // Update tokens
  conn.accessToken = tokens.access_token;

  // Refresh token may have changed (rotation)
  if (tokens.refresh_token) {
    conn.refreshToken = tokens.refresh_token;
    // Save new refresh token to database
    await saveRefreshToken(conn.orgId, tokens.refresh_token);
  }

  return tokens;
}
```

---

## Testing Checklist

### ✅ OAuth Flow

- [ ] Authorization code obtained successfully
- [ ] Code URL-decoded correctly
- [ ] Access token received
- [ ] Refresh token received
- [ ] Instance URL correct
- [ ] User info retrieved
- [ ] Token refresh works
- [ ] Token revocation works

### ✅ API Calls

- [ ] List objects (GET /sobjects)
- [ ] Describe Lead (GET /sobjects/Lead/describe)
- [ ] Query Leads (GET /query)
- [ ] Create Lead (POST /sobjects/Lead)
- [ ] Update Lead (PATCH /sobjects/Lead/ID)
- [ ] Delete Lead (DELETE /sobjects/Lead/ID)

### ✅ Custom Fields

- [ ] List custom fields (Tooling API)
- [ ] Create text field
- [ ] Create number field
- [ ] Create picklist field
- [ ] Field appears in describe

### ✅ Attachments

- [ ] Upload attachment
- [ ] Link attachment to lead
- [ ] Query attachments

### ✅ Error Handling

- [ ] Expired token handled
- [ ] Invalid credentials handled
- [ ] Network errors handled
- [ ] Duplicate detection works

---

## Postman Environment Variables

Create an environment in Postman with these variables:

```json
{
  "name": "Salesforce Dev",
  "values": [
    {
      "key": "instance_url",
      "value": "https://orgfarm-0fb60c8e1f-dev-ed.develop.my.salesforce.com",
      "enabled": true
    },
    {
      "key": "client_id",
      "value": "3MVG9rZjd7MXFdLjcmv2WrBcFvYgqfMxJzyW7.osW1KAWiHjC4Oh_C31c_DOCfKp0d.knPO6fvApDr8Y5qfgl",
      "enabled": true
    },
    {
      "key": "client_secret",
      "value": "D638DD0A7C0DD06A57DAE136320DD52317D99F54FF9D8886725F7ADC420F356AD",
      "enabled": true,
      "type": "secret"
    },
    {
      "key": "redirect_uri",
      "value": "https://oauth.pstmn.io/v1/callback",
      "enabled": true
    },
    {
      "key": "access_token",
      "value": "",
      "enabled": true
    },
    {
      "key": "refresh_token",
      "value": "",
      "enabled": true
    },
    {
      "key": "api_version",
      "value": "v59.0",
      "enabled": true
    }
  ]
}
```

---

## Next Steps

1. ✅ **Complete Postman Collection**
   - Import all requests from this documentation
   - Test each endpoint
   - Save responses as examples

2. **Implement Custom Field Auto-Creation**
   - Detect missing fields (Question01__c, etc.)
   - Prompt user to create
   - Use Tooling API to create fields

3. **Build Professional Dashboard**
   - Lead analytics
   - Field mapping UI
   - Transfer history
   - Error logs

4. **Production Deployment**
   - Update callback URLs
   - Configure HTTPS
   - Enable token encryption
   - Setup monitoring

---

## Resources

**Salesforce Documentation:**
- [OAuth 2.0 Web Server Flow](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm)
- [REST API Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/)
- [Tooling API Guide](https://developer.salesforce.com/docs/atlas.en-us.api_tooling.meta/api_tooling/)
- [SOQL Reference](https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/)

**Tools:**
- [URL Encoder/Decoder](https://meyerweb.com/eric/tools/dencoder/)
- [JWT Decoder](https://jwt.io/)
- [Postman](https://www.postman.com/)

---

**Document Version:** 1.0
**Last Updated:** 2025-10-07
**Author:** Development Team
