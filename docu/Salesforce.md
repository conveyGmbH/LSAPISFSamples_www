# Salesforce Integration for LeadSuccess API

![Salesforce Integration](https://img.shields.io/badge/Salesforce-API-blue)
![OAuth 2.0](https://img.shields.io/badge/OAuth-2.0-green)
![Node.js](https://img.shields.io/badge/Node.js-Backend-brightgreen)

A professional integration solution enabling seamless lead transfer from LeadSuccess to Salesforce, with support for attachments and custom client-specific Salesforce configurations.

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Client-Specific Salesforce Configuration](#client-specific-salesforce-configuration)
- [Data Security & Storage](#data-security--storage)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)

## 🔍 Overview

This solution enables the secure transfer of lead data and attachments from the LeadSuccess system to Salesforce. It implements OAuth 2.0 authentication, secure handling of tokens, and a flexible architecture that allows for client-specific Salesforce connections.

## ✨ Key Features

- **OAuth 2.0 Authentication** with Salesforce
- **Secure Token Storage** using browser's localStorage
- **Custom Salesforce Configuration** for each client
- **Lead Data Transfer** with validation and cleaning
- **Attachment Support** with document linking
- **Duplicate Detection** to avoid creating duplicate leads
- **Responsive UI** for managing the transfer process

## 🏗️ Architecture

The integration follows a three-tier architecture:

### 1. Frontend (Client-Side)

- **User Interface** for selecting leads and initiating transfers
- **Authentication Management** including token handling and storage
- **Client-Specific Configuration** storage and management
- **Attachment Preview** and preparation

### 2. Backend (Node.js Server)

- **OAuth 2.0 Authentication Flow** handling
- **Lead Data Processing** and validation
- **Support for Client-Specific Configurations** during transfers
- **Attachment Processing** and upload
- **Error Handling** and response formatting

### 3. Salesforce (Cloud)

- **Lead Storage** in Salesforce database
- **Document Management** via ContentVersion objects
- **Authentication** via OAuth 2.0 protocols

### Data Flow Diagram

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│             │      │             │      │             │
│  Frontend   │─────▶│   Backend   │─────▶│ Salesforce  │
│             │◀─────│             │◀─────│             │
└─────────────┘      └─────────────┘      └─────────────┘
     │                                          ▲
     │                                          │
     └──────────────────────────────────────────┘
          (Direct auth for token acquisition)
```

## 🔧 Client-Specific Salesforce Configuration

### Overview

The system now supports client-specific Salesforce configurations, allowing each client to connect to their own Salesforce organization independently. This is especially useful in multi-tenant environments or when working with clients who have their own Salesforce instances.

### Key Components

1. **Configuration Interface**: A modal dialog that allows clients to enter their Salesforce credentials:
   - Client ID (Consumer Key)
   - Client Secret (Consumer Secret)
   - Login URL (Production or Sandbox)
   - Redirect URI

2. **Secure Storage**: Client configurations are stored securely in the browser's localStorage, ensuring that:
   - Data remains client-specific and isolated
   - No server-side storage of sensitive credentials
   - Configurations persist across sessions

3. **Seamless Integration**: During lead transfers, the system:
   - Detects if client-specific configuration exists
   - Uses the client's configuration for authentication and transfer
   - Falls back to default system configuration if no client configuration exists

### Configuration Process

1. Click the "Config SF" button in the lead transfer interface
2. Enter Salesforce Connected App credentials in the modal
3. Save the configuration (stored locally in the client's browser)
4. The system will now use these credentials for all Salesforce operations

### Benefits

- **Independence**: Clients can work with their own Salesforce organizations
- **Privacy**: Credentials are stored only on the client-side
- **Flexibility**: Support for both production and sandbox environments
- **Transparency**: Clear indication of which configuration is being used

## 🔒 Data Security & Storage

### LocalStorage Usage

The system uses the browser's localStorage for secure client-side storage of:

1. **Authentication Data**:
   ```javascript
   {
     "accessToken": "00D5i00000XXXX!AQMAQHf1ogmz2V...",
     "refreshToken": "5Aep861TSESvWeug_zcpkK...",
     "instanceUrl": "https://mycompany.my.salesforce.com",
     "userInfo": {
       "id": "https://login.salesforce.com/id/00D5i00000XXXX/0055i000000XXXX",
       "asserted_user": true,
       "user_id": "0055i000000XXXX",
       "organization_id": "00D5i00000XXXX",
       "username": "user@example.com",
       "nick_name": "User",
       "display_name": "User Name",
       "email": "user@example.com",
       "email_verified": true,
       "first_name": "User",
       "last_name": "Name",
       "locale": "en_US",
       "language": "en_US",
       "timezone": "America/Los_Angeles",
       "photos": {
         "picture": "https://mycompany.my.salesforce.com/profilephoto/005/F",
         "thumbnail": "https://mycompany.my.salesforce.com/profilephoto/005/T"
       },
       "addr_street": null,
       "addr_city": null,
       "addr_state": null,
       "addr_country": null,
       "addr_zip": null,
       "mobile_phone": null,
       "mobile_phone_verified": false,
       "is_lightning_login_user": false,
       "status": {
         "created_date": null,
         "body": null
       }
     },
     "timestamp": 1684159238574
   }
   ```

2. **Client-Specific Salesforce Configuration**:
   ```javascript
   {
     "SF_CLIENT_ID": "3MVG9Dz7X4OImXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
     "SF_CLIENT_SECRET": "AECF0D5A5XXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
     "SF_LOGIN_URL": "https://login.salesforce.com",
     "SF_REDIRECT_URI": "https://lsapisfbackend.convey.de/api/oauth2/callback"
   }
   ```

### Security Considerations

- **No Sensitive Data on Server**: All credentials remain in the client's browser
- **HTTPs Required**: Always use HTTPS in production to secure data in transit
- **Token Validation**: Automatic verification of token validity before operations
- **Token Expiry**: Automatic refresh of expired tokens
- **Clear Data Option**: Users can reset/clear stored configurations

## 📥 Installation

```bash
# Clone the repository
git clone https://github.com/your-organization/leadsuccess-salesforce-integration.git

# Navigate to the directory
cd leadsuccess-salesforce-integration

# Install dependencies
npm install

# Setup environment variables (see Configuration section)
cp .env.example .env
```

## 🚀 Usage

### Server-Side Setup

1. Configure your environment variables (see Configuration section)
2. Start the server:
   ```bash
   npm start
   ```

### Client-Side Integration

1. Include the necessary JavaScript files in your HTML
2. Use the provided controllers for lead display and transfer
3. Customize the UI as needed for your application

### Lead Transfer Process

1. User selects a lead from the list
2. User clicks "Transfer to Salesforce" button
3. If not authenticated, the system initiates OAuth flow
4. The system detects if client-specific configuration exists and uses it
5. Lead data and attachments are transferred to Salesforce
6. Results are displayed to the user

## ⚙️ Configuration

### Environment Variables

Server-side configuration requires the following environment variables:

```env
# Default Salesforce Configuration
SF_CLIENT_ID=your_default_client_id
SF_CLIENT_SECRET=your_default_client_secret
SF_LOGIN_URL=https://login.salesforce.com
SF_REDIRECT_URI=https://your-domain.com/api/oauth2/callback

# Server Configuration  
PORT=3000
NODE_ENV=production

# Frontend URLs
FRONTEND_DEV_URL=http://localhost:5504
FRONTEND_PROD_URL=https://your-domain.com
BACKEND_DEV_URL=http://localhost:3000
BACKEND_PROD_URL=https://your-api-domain.com
```

### Client Configuration

Clients can configure their own Salesforce connection via the UI by providing:

1. Client ID (Consumer Key)
2. Client Secret
3. Login URL (Production or Sandbox)
4. Redirect URI

## ❓ Troubleshooting

### Common Issues

1. **Authentication Failures**
   - Verify Client ID and Client Secret
   - Check that Redirect URI exactly matches your Salesforce Connected App configuration
   - Ensure the Connected App has the necessary OAuth scopes

2. **CORS Issues**
   - Verify that your domain is added to Salesforce CORS allowlist
   - Ensure all requests use HTTPS if required by your CORS configuration

3. **Lead Transfer Failures**
   - Check for missing required fields (LastName, Company)
   - Verify token validity
   - Check attachment size limits (max 25MB per file)

## 📘 API Reference

### Server-Side Endpoints

```
GET  /api/salesforce/auth            - Get Salesforce authentication URL
GET  /api/oauth2/callback            - OAuth2 callback for Salesforce
GET  /api/salesforce/userinfo        - Get Salesforce user information
POST /api/salesforce/leads           - Create lead in Salesforce
POST /api/direct-lead-transfer       - Transfer lead with attachments to Salesforce
```

### Client-Side Services

```javascript
// SalesforceService
getAuthUrl()             // Get authentication URL from server
getStoredAuthData()      // Get authentication data from localStorage
storeAuthData(data)      // Store authentication data in localStorage
clearAuthData()          // Clear authentication data from localStorage
isAuthValid()            // Check if stored authentication is still valid

// SalesforceConfigManager
getConfig()              // Get client-specific configuration from localStorage
saveConfig(config)       // Save client-specific configuration to localStorage
clearConfig()            // Clear client-specific configuration
hasCustomConfig()        // Check if client-specific configuration exists
validateConfig(config)   // Validate client-specific configuration
```

---

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contact

For questions or support, please contact `developer@convey.de`