# Progressive Web App (PWA) Setup Guide

## Overview
This guide explains how to set up and configure the PWA features of iRescue, including push notifications, offline support, and mobile installation.

## Features
- **Mobile Installation**: Install the app on iOS/Android devices for a native-like experience
- **Offline Support**: Access cached content when offline
- **Push Notifications**: Receive instant notifications for urgent updates
- **Mobile Camera**: Direct camera access for uploading photos

## Push Notification Setup

### Step 1: Generate VAPID Keys
VAPID (Voluntary Application Server Identification) keys are required for Web Push notifications.

```bash
# Generate VAPID keys using web-push
npx web-push generate-vapid-keys
```

This will output something like:
```
=======================================

Public Key:
BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U

Private Key:
UUxI4O8DdGkC8bHdoFLT4_WE8xjbFKRfBbQsKJNVB8s

=======================================
```

### Step 2: Add VAPID Keys to Replit Secrets
In your Replit project:

1. Click on the "Tools" icon in the left sidebar
2. Select "Secrets" (lock icon)
3. Add the following secrets:

```
VAPID_PUBLIC_KEY=<your_public_key_here>
VAPID_PRIVATE_KEY=<your_private_key_here>
VAPID_SUBJECT=mailto:support@irescue.life
```

**Important:**
- Replace `<your_public_key_here>` with the Public Key from step 1
- Replace `<your_private_key_here>` with the Private Key from step 1
- You can customize the VAPID_SUBJECT email address (must be a valid mailto: URL)

### Step 3: Restart the Application
After adding the secrets, restart your Replit application:
```bash
# The application will automatically reload when you save changes
# Or manually restart from the Replit interface
```

### Step 4: Test Push Notifications
1. Log in to your rescue organization dashboard
2. Navigate to **Settings** page
3. Scroll to **Push Notifications** section
4. Click the toggle to enable notifications
5. Grant permission when your browser prompts you
6. If you're an admin, click **Send Test Notification** to verify it works

## Using Push Notifications

### For Users
1. **Enable Notifications**: Go to Settings > Push Notifications and toggle on
2. **Grant Browser Permission**: Allow notifications when prompted
3. **Receive Updates**: You'll get notifications for:
   - Medical alerts for animals in your care (foster families)
   - Urgent supply requests (foster families)
   - Critical updates from your rescue (all users)

### For Developers: Sending Notifications
You can trigger push notifications programmatically:

```typescript
import { PushNotificationService } from './services/push-notifications';

// Send to a specific user
await PushNotificationService.sendToUser(userId, {
  title: 'Medical Alert',
  body: 'Fluffy needs medication at 3 PM',
  icon: '/icon-192.png',
  tag: 'medical-alert',
  data: { animalId: '123', type: 'medication' },
});

// Send to all users with specific roles in a tenant
await PushNotificationService.sendToTenantRoles(
  tenantId,
  ['foster', 'staff'],
  {
    title: 'Supply Request',
    body: 'Foster family needs puppy food',
    requireInteraction: true,
  }
);
```

## Mobile Installation

### iOS (Safari)
1. Open the website in Safari
2. Tap the Share button (square with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add" to confirm
5. The app icon will appear on your home screen

### Android (Chrome)
1. Open the website in Chrome
2. Tap the three-dot menu
3. Tap "Add to Home Screen" or "Install app"
4. Tap "Add" to confirm
5. The app icon will appear on your home screen

## Offline Support
The service worker automatically caches:
- Static assets (JavaScript, CSS, fonts)
- API responses (for 1 hour)
- Images and media

When offline:
- Previously viewed pages will still load
- Cached data will be displayed
- A banner will indicate offline status

## Mobile Camera Support
When uploading photos on a mobile device:
1. Tap the upload button
2. You'll see options including "Take Photo"
3. Select "Take Photo" to use the device camera
4. Take the photo and confirm
5. The photo uploads automatically

## Troubleshooting

### Push Notifications Not Working
1. **Check VAPID keys**: Ensure all three secrets are correctly set in Replit
2. **Check browser permissions**: Make sure notifications are allowed in browser settings
3. **Try a different browser**: Push notifications work best in Chrome, Firefox, Edge, and Safari 16.4+
4. **Check logs**: Look for errors in the browser console or Replit logs

### App Not Installing
1. **Use HTTPS**: PWAs require a secure connection (Replit provides this automatically)
2. **Use supported browser**: 
   - iOS: Safari 11.1+
   - Android: Chrome 40+
   - Desktop: Chrome 40+, Edge 17+, Firefox 44+
3. **Check manifest**: Ensure `/manifest.json` is accessible

### Service Worker Not Registering
1. **Check browser console** for errors
2. **Verify service worker file** exists at `/service-worker.js`
3. **Clear browser cache** and hard reload (Ctrl+Shift+R or Cmd+Shift+R)

## Technical Details

### Architecture
- **Service Worker**: `client/public/service-worker.js`
- **Manifest**: `client/public/manifest.json`
- **Push Service**: `server/services/push-notifications.ts`
- **Frontend Hook**: `client/src/hooks/usePushNotifications.ts`
- **Database**: `push_subscriptions` table with tenant isolation

### Browser Compatibility
- **iOS**: Safari 16.4+ (push notifications), Safari 11.1+ (install)
- **Android**: Chrome 40+, Firefox 44+
- **Desktop**: Chrome 40+, Edge 17+, Firefox 44+, Safari 11.1+

### Security
- VAPID keys authenticate your server to push services
- Subscriptions are tenant-scoped to prevent cross-organization notifications
- Service worker only caches public assets and user-specific data
- Push notification endpoints are authenticated and require login

## Resources
- [Web Push Protocol](https://datatracker.ietf.org/doc/html/rfc8030)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
