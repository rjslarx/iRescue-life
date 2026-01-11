# Google Workspace Integration Setup Guide

## Overview
This guide explains how to configure Google Workspace for Nonprofits integration for the iRescue.life platform. This is a **platform-level** configuration that enables all tenants to optionally connect their Google Workspace accounts.

## Prerequisites
- Google Cloud account with billing enabled (required for OAuth)
- Access to Google Cloud Console
- Platform administrator access to iRescue.life environment variables

## Benefits for Tenants
Once configured, tenants with Google Workspace for Nonprofits can:
- **Send unlimited emails** through Gmail API (bypassing Resend quotas)
- **Sync calendar events** with Google Calendar
- **Auto-generate Google Meet links** for events
- **Store documents** in Google Drive

## Setup Steps

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Name: `iRescue.life Platform`
4. Click **Create**

### 2. Enable Required APIs

Navigate to **APIs & Services → Library** and enable:

- **Gmail API** - For sending emails via Gmail
- **Google Calendar API** - For calendar synchronization
- **Google Drive API** - For document storage

For each API:
1. Search for the API name
2. Click on it
3. Click **Enable**

### 3. Configure OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Select **External** user type (tenants are external to the platform)
3. Click **Create**

**App Information:**
- **App name**: `iRescue.life`
- **User support email**: Your platform admin email
- **App logo**: (Optional) Upload your platform logo
- **Application home page**: `https://irescue.life`
- **Application privacy policy**: `https://irescue.life/platform/privacy`
- **Application terms of service**: `https://irescue.life/platform/terms`

**Developer contact information:**
- Add your email address

Click **Save and Continue**

**Scopes:**

Add these scopes (click **Add or Remove Scopes**):

```
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.settings.basic
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/drive.file
https://www.googleapis.com/auth/userinfo.email
```

**Note:** The `drive.file` scope is a non-sensitive scope that allows the app to create and manage only files it uploads. This avoids the restricted scope verification and security assessment requirements. With this scope, Shared Drive selection won't auto-populate - tenants will need to manually enter their Shared Drive ID (found in the Drive URL).

Click **Update** → **Save and Continue**

**Test users:**

During development, add test email addresses that can authorize the app.

Click **Save and Continue** → **Back to Dashboard**

### 4. Create OAuth 2.0 Credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client ID**

**Application type:** Web application

**Name:** `iRescue.life Web Client`

**Authorized JavaScript origins:**
```
https://irescue.life
```

**Authorized redirect URIs:**
```
https://irescue.life/api/google-workspace/callback
```

For development/testing, also add:
```
https://your-dev-domain.replit.dev/api/google-workspace/callback
```

3. Click **Create**
4. **Copy the Client ID and Client Secret** that appear
   - ⚠️ **Save these securely** - you'll need them in the next step

### 5. Configure Environment Variables

Add the OAuth credentials to your Replit project:

**In Replit:**
1. Open the **Secrets** tab (Tools → Secrets)
2. Add these secrets:
   - Key: `GOOGLE_CLIENT_ID`  
     Value: `<your-client-id-from-step-4>`
   - Key: `GOOGLE_CLIENT_SECRET`  
     Value: `<your-client-secret-from-step-4>`

**Via Replit Agent:**
Ask the agent to add the secrets:
```
Please add these secrets:
- GOOGLE_CLIENT_ID: <paste-client-id>
- GOOGLE_CLIENT_SECRET: <paste-client-secret>
```

### 6. Verify Integration

1. **Restart the application** after adding secrets
2. Log in as a tenant admin
3. Navigate to **Settings → Integrations → Google Workspace**
4. Click **Connect Google Workspace**
5. You should be redirected to Google's OAuth consent screen
6. Authorize the connection
7. Verify successful redirect back to the platform

## Security Considerations

### OAuth State Validation
The platform implements multiple layers of security:
- **Nonce generation**: Cryptographically secure random UUIDs
- **Server-side storage**: OAuth states stored in database with 10-minute expiration
- **Session validation**: Nonce must match authenticated session
- **User/tenant verification**: Authenticated user and tenant must match original requester

### Token Management
- **Access tokens**: Encrypted and stored in database
- **Refresh tokens**: Encrypted and automatically renewed
- **Token rotation**: Automatic refresh when tokens expire

### Data Access
Tenants can only access their own Google Workspace data. The platform:
- Never accesses tenant emails or documents
- Only performs actions explicitly requested by the tenant
- Stores minimal metadata (connection status, features enabled)

## Troubleshooting

### "Redirect URI mismatch" error
- Verify the redirect URI in Google Cloud Console exactly matches: `https://irescue.life/api/google-workspace/callback`
- Ensure there are no trailing slashes or extra spaces

### "Access blocked: This app's request is invalid"
- Check that all required APIs are enabled in Google Cloud Console
- Verify OAuth consent screen is fully configured

### "Connection Not Available" message
- Confirm `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` secrets are set
- Restart the application after adding secrets
- Check application logs for errors

### OAuth consent screen shows "unverified app" warning
This is normal during development. For production:
1. Complete the OAuth consent screen verification process
2. Submit for Google's review (can take 1-2 weeks)
3. Once verified, users won't see the warning

## Production Deployment

Before going live:

1. **Remove test users** from OAuth consent screen
2. **Publish the app** (change from "Testing" to "In Production")
3. **Submit for verification** if you want to remove the "unverified app" warning
4. **Monitor usage** via Google Cloud Console → APIs & Services → Dashboard

## Tenant Instructions

Once configured, tenants can connect their Google Workspace:

1. Log in as an admin
2. Complete the setup wizard (or go to Settings → Integrations)
3. Click **Connect Google Workspace**
4. Authorize access using a Google Workspace admin account
5. Select which features to enable:
   - Gmail API for email sending
   - Calendar sync
   - Drive storage

## Support

For issues or questions:
- Platform documentation: https://irescue.life/platform
- Google Cloud support: https://cloud.google.com/support
- OAuth documentation: https://developers.google.com/identity/protocols/oauth2

## Cost Considerations

### Google Cloud
- OAuth and API calls are **free** within Google's generous limits
- No billing required for typical nonprofit usage
- Monitor usage in Google Cloud Console

### Google Workspace for Nonprofits
- Free for qualified nonprofits (up to 2,000 users)
- Tenants must apply at: https://www.google.com/nonprofits/
- Verification typically takes 2-14 business days

## Changelog

- **2025-11-24**: Initial documentation created
