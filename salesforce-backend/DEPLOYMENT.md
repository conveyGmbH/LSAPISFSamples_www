# Deployment Guide for Azure

## Important Files for Deployment

The following files and directories MUST be included in the deployment:

### Required Directories
- `views/` - Contains HTML templates (index.html, auth-start.html)
- `middleware/` - Authentication and middleware logic
- `config/` - Configuration files (if exists)
- Any other application directories

### Required Files
- `server.js` - Main application entry point
- `package.json` - Dependencies and scripts
- `package-lock.json` - Locked dependencies
- `web.config` - IIS configuration for Azure
- `.deployment` - Deployment configuration
- All service files (salesforce.js, leadTransferService.js, etc.)

## Azure Deployment Checklist

1. **Verify files exist locally:**
   ```bash
   ls -la views/
   # Should show: index.html, auth-start.html
   ```

2. **Check .gitignore:**
   - Ensure `views/` is NOT ignored
   - Ensure `node_modules/` IS ignored (will be installed on Azure)

3. **Environment Variables on Azure:**
   Set these in Azure App Settings:
   - `NODE_ENV=production`
   - `PORT=8080` (or leave default)
   - `SF_CLIENT_ID` - Salesforce OAuth Client ID
   - `SF_CLIENT_SECRET` - Salesforce OAuth Client Secret
   - `SF_REDIRECT_URI` - Full callback URL
   - `SF_LOGIN_URL` - Salesforce login URL
   - `SESSION_SECRET` - Session encryption key
   - `REDIS_URL` (optional) - Redis connection string

4. **Deploy to Azure:**
   - Push to Git repository
   - Azure will automatically:
     - Copy all files (except those in .gitignore)
     - Run `npm install`
     - Start the application with `npm start`

5. **Verify Deployment:**
   - Check Azure logs for startup messages
   - Visit `https://your-app.azurewebsites.net/`
   - Should see the homepage (views/index.html)
   - Check logs for: "✅ Views directory exists"

## Troubleshooting

### Error: "ENOENT: no such file or directory, stat '/home/site/index.html'"

**Cause:** The `views/` directory was not deployed to Azure.

**Solutions:**
1. Check `.gitignore` - ensure `views/` is not ignored
2. Verify files exist in local repository
3. Force add views directory:
   ```bash
   git add -f views/*
   git commit -m "Force add views directory"
   git push
   ```

### Error: Module not found

**Cause:** Dependencies not installed or package.json missing.

**Solution:**
- Ensure `package.json` is committed
- Check Azure deployment logs for npm install errors

### Error: Application doesn't start

**Solution:**
- Check Azure Application Logs (Kudu)
- Verify environment variables are set
- Check for syntax errors in server.js

## Directory Structure

```
salesforce-backend/
├── server.js                 # Main entry point ✅
├── package.json             # Dependencies ✅
├── web.config               # IIS config ✅
├── .deployment              # Deployment config ✅
├── .gitignore              # Git ignore rules ✅
├── .deployignore           # Azure deploy ignore ✅
├── views/                   # HTML templates ✅
│   ├── index.html          # Homepage ✅
│   └── auth-start.html     # OAuth page ✅
├── middleware/             # Auth middleware ✅
├── salesforce.js           # Salesforce service ✅
├── leadTransferService.js  # Lead transfer logic ✅
└── ... other files
```

## Post-Deployment Verification

1. **Homepage accessible:**
   ```
   GET https://your-app.azurewebsites.net/
   ```
   Should return the HTML homepage with status 200.

2. **API health check:**
   ```
   GET https://your-app.azurewebsites.net/api/health
   ```
   Should return: `{"status":"healthy server run"}`

3. **Check logs:**
   - Go to Azure Portal
   - Your App Service → Monitoring → Log stream
   - Look for startup messages and any errors
