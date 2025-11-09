# LeadSuccess API for Salesforce Samples

## Overview
This project provides a sample integration with Salesforce using the LeadSuccess API. It includes a backend server built with Node.js and Express that handles Salesforce OAuth2 authentication, lead creation, and lead transfer with attachments. The frontend is a simple web application that allows users to connect to the Salesforce API and manage leads.

## Features
- OAuth2 authentication with Salesforce
- Create and transfer leads to Salesforce
- Upload attachments linked to leads
- API endpoints for Salesforce integration
- Sample frontend for API connection and interaction
- Comprehensive API documentation included

## Project Structure
- `salesforce-backend/`: Node.js Express backend server
- `index.html`: Frontend entry point
- `css/`, `js/`, `images/`: Frontend assets and scripts
- `docs/LeadSuccess_API_for SalesForce.pdf`: API documentation PDF

## Prerequisites
- Node.js (v14 or higher recommended)
- npm (Node package manager)
- Salesforce Developer account and connected app for OAuth2 credentials

## Environment Variables
Create a `.env` file in the `salesforce-backend` directory with the following variables:

```
SF_CLIENT_ID=your_salesforce_client_id
SF_CLIENT_SECRET=your_salesforce_client_secret
SF_REDIRECT_URI=http://localhost:3000/api/oauth2/callback
SF_LOGIN_URL=https://login.salesforce.com
PORT=3000
NODE_ENV=development
```

- `SF_CLIENT_ID` and `SF_CLIENT_SECRET`: From your Salesforce connected app
- `SF_REDIRECT_URI`: OAuth2 callback URL (default shown above)
- `SF_LOGIN_URL`: Salesforce login URL (default is production)
- `PORT`: Backend server port (default 3000)
- `NODE_ENV`: Environment mode

## Backend Setup and Running
1. Navigate to the backend directory:
   ```
   cd salesforce-backend
   ```
2. Install dependencies:
   ```
   npm install
   ```
3. Start the backend server:
   - For production:
     ```
     npm start
     ```
   - For development with auto-reload:
     ```
     npm run dev
     ```
4. The backend server will run at `http://localhost:3000` by default.

## Frontend Usage
- Open `index.html` in a web browser.
- Use the login form to connect to the Salesforce API backend.
- The frontend communicates with the backend API to authenticate and manage leads.
- API documentation is available for download on the frontend page.

## API Endpoints
The backend exposes the following key API endpoints:

| Method | Path                      | Description                                  |
|--------|---------------------------|----------------------------------------------|
| GET    | /api/salesforce/auth      | Get Salesforce OAuth2 authorization URL     |
| GET    | /api/oauth2/callback      | OAuth2 callback for Salesforce               |
| POST   | /api/salesforce/leads     | Create a lead in Salesforce                   |
| GET    | /api/salesforce/userinfo  | Get Salesforce user information              |
| POST   | /api/direct-lead-transfer | Transfer lead with attachments to Salesforce|
| GET    | /api/health               | Health check endpoint                         |

## Additional Information
- The backend supports CORS for local development and production URLs.
- Lead creation includes duplicate email checking.
- Attachments are uploaded as Salesforce ContentVersion records linked to leads.

## Documentation
Detailed API documentation is available in the `docs/LeadSuccess_API_for SalesForce.pdf` file.

## License
This project is licensed under the MIT License. See the LICENSE file for details.

## Contact
For questions or support, please contact the project maintainer. `developer@convey.de`

