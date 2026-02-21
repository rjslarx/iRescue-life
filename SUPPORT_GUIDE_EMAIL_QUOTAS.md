# Support Guide: Email Quotas & Subscription Tiers

## Overview
iRescue.life uses a hybrid email system where tenants receive monthly email quotas based on their subscription tier, with an option for enterprise customers to bring their own Resend account (BYOK) for unlimited sending.

## Subscription Tiers & Email Quotas

| Tier | Price | Email Quota | BYOK Option |
|------|-------|-------------|-------------|
| Trial | Free | 500/month | No |
| Starter | $12/month | 500/month | No |
| Professional | $39/month | 5,000/month | No |
| Enterprise | $99/month | 25,000/month | Yes (unlimited) |

## How the System Works

### Platform-Managed Email (Default)
- Tenants use our shared Resend account by default
- Monthly quotas are enforced based on subscription tier
- Counter resets on the 1st of each month (automated)
- Tenants can see their usage in Settings > Email

### Bring Your Own Key (BYOK) - Enterprise Only
- Enterprise customers can configure their own Resend API key
- No quota limits when using their own account
- They manage their own Resend billing directly
- Get their key from https://resend.com (3,000 free/month on Resend's free tier)

## Common Support Tasks

### 1. Checking a Tenant's Email Usage

**Via Database Query:**
```sql
SELECT 
  name,
  subscription_tier,
  emails_sent_this_month,
  email_quota_limit,
  resend_enabled,
  last_email_quota_reset
FROM tenants
WHERE subdomain = 'tenant-subdomain';
```

**What to look for:**
- `emails_sent_this_month` - Current usage
- `email_quota_limit` - Monthly limit
- `resend_enabled` - If true, they're using BYOK (no quota)
- `last_email_quota_reset` - When counter was last reset

### 2. Upgrading a Tenant's Subscription Tier

**Endpoint:** `PATCH /api/admin/tenants/:id/subscription`

**Request Body:**
```json
{
  "subscriptionTier": "professional",
  "subscriptionStatus": "active"
}
```

**What Happens:**
1. Subscription tier updates to new level
2. Email quota automatically adjusts to new tier's limit
3. Current month's email count remains unchanged
4. New quota applies immediately

**Important Notes:**
- Upgrading mid-month keeps their current usage count
- Quota limit changes immediately
- If they've already exceeded the new quota, they can't send more until reset

**Example Scenarios:**

**Scenario 1: Starter to Professional Mid-Month**
- Tenant has sent 400 emails on Starter (500 limit)
- Upgrades to Professional (5,000 limit)
- New state: 400/5,000 emails used
- They can now send 4,600 more emails this month

**Scenario 2: Professional to Starter (Downgrade)**
- Tenant has sent 2,000 emails on Professional (5,000 limit)
- Downgrades to Starter (500 limit)
- New state: 2,000/500 emails used (OVER QUOTA)
- They cannot send more emails until next month's reset

### 3. Configuring BYOK for Enterprise Customers

**Prerequisites:**
- Tenant must be on Enterprise tier ($99/month)
- Tenant needs to create account at https://resend.com
- Tenant needs to generate API key (starts with `re_`)
- Tenant needs to verify their sending domain in Resend

**Steps:**
1. Tenant navigates to Settings > Email in their portal
2. Scroll to "Email Settings" section
3. Enter their Resend API key (re_...)
4. Enter their verified from email address
5. Enter their from name
6. Click "Enable Email Service" or "Update Email Settings"

**What Happens:**
- API key is encrypted before storage (AES-256-GCM)
- System automatically switches to their key for all emails
- No more quota limits (they're on their own Resend account)
- Usage badge changes from "Platform Account" to "Your Account"

**Troubleshooting BYOK:**
- **"Invalid API key"** - Key must start with `re_`
- **"Email sending failed"** - From address must be verified in their Resend account
- **"Domain not verified"** - They need to add DNS records in Resend dashboard

### 4. Manually Resetting Email Quota (Emergency)

**When to Use:**
- Tenant's quota was incorrectly charged
- System error caused double-counting
- Special exception approved by management

**Endpoint:** `POST /api/admin/reset-email-quotas`

**What it does:**
- Resets ALL tenants' email counters to 0
- Updates `last_email_quota_reset` timestamp
- Should normally only run on 1st of month

**For Single Tenant Reset (Database):**
```sql
UPDATE tenants
SET 
  emails_sent_this_month = 0,
  last_email_quota_reset = NOW()
WHERE id = 'tenant-id-here';
```

### 5. Handling "Quota Exceeded" Support Requests

**Customer says:** "I can't send emails anymore!"

**Steps:**
1. Check their current usage vs. quota
2. Check when quota was last reset
3. Verify their subscription tier

**Options:**
- **Wait until reset**: Next monthly reset (1st of month)
- **Upgrade tier**: Immediately increases quota
- **Configure BYOK**: Enterprise only, unlimited sending
- **Emergency reset**: Requires manager approval

**Response Template:**
```
Hi [Tenant Name],

I can see you've sent [X] emails this month and your [TIER] plan 
includes [QUOTA] emails per month. Your quota will automatically 
reset on the 1st of next month.

To send more emails now, you have these options:

1. Upgrade to [NEXT TIER] plan for [NEW QUOTA] emails/month
2. [If eligible] Configure your own Resend account for unlimited sending
3. Wait until [NEXT RESET DATE] when your quota resets

Would you like help upgrading your plan?
```

## Monthly Quota Reset Schedule

**Automated Process (Production):**
- Runs: 1st of every month at 12:01 AM UTC
- Method: Scheduled Deployment calling `/api/admin/reset-email-quotas`
- All tenants' counters reset to 0 simultaneously
- Quotas remain based on current subscription tier

**Monitoring:**
- Check deployment logs on 1st of month
- Verify reset completed successfully
- Watch for any error alerts

## Troubleshooting

### Quota Not Enforcing
**Symptom:** Tenant sent more than their quota allows

**Check:**
1. Do they have `resend_enabled = true`? (They might be using BYOK)
2. Check `resend_api_key_encrypted` - if populated, they bypass quotas
3. Verify EmailService is checking quotas properly

### Emails Not Sending
**Symptom:** All email sends failing

**Check:**
1. Platform Resend API key is valid (`PLATFORM_RESEND_API_KEY` env var)
2. Tenant hasn't exceeded quota
3. If using BYOK, their API key is valid
4. From address is verified in Resend

### Usage Counter Incorrect
**Symptom:** Counter doesn't match actual sends

**Possible Causes:**
- Failed sends still incremented counter
- Multiple processes accessing database
- Manual database changes

**Fix:**
- Review email send logs
- Compare with Resend dashboard stats
- Manually adjust if confirmed incorrect

## Best Practices

### For Support Staff
1. Always check subscription tier before discussing quotas
2. Document tier changes in support tickets
3. Verify BYOK setup is complete before closing ticket
4. Remind customers about monthly reset dates

### For Platform Admins
1. Monitor quota usage trends to identify upgrade opportunities
2. Review failed email logs weekly
3. Ensure monthly reset job is running reliably
4. Keep platform Resend key secure and rotated quarterly

### For Sales Team
1. Emphasize unlimited emails with BYOK option
2. Professional tier (5,000 emails) suitable for most rescues
3. Trial tier same quota as Starter for easy evaluation
4. Enterprise BYOK saves costs for high-volume senders

## API Reference

### Get Tenant Email Usage
```
GET /api/tenant/email-usage
Authorization: Bearer [user-session]

Response:
{
  "sent": 150,
  "limit": 500,
  "remaining": 350,
  "lastReset": "2025-01-01T00:01:00Z",
  "usePlatformKey": true,
  "hasOwnApiKey": false
}
```

### Update Subscription Tier (Platform Admin Only)
```
PATCH /api/admin/tenants/:tenantId/subscription
Authorization: Bearer [platform-admin-session]

Body:
{
  "subscriptionTier": "professional",
  "subscriptionStatus": "active"
}

Response:
{
  "success": true,
  "tenant": { ... },
  "message": "Updated subscription to professional tier with 5000 emails/month"
}
```

### Reset All Email Quotas (Platform Admin Only)
```
POST /api/admin/reset-email-quotas
Authorization: Bearer [platform-admin-session]

Response:
{
  "success": true,
  "message": "Reset email quotas for 42 tenants",
  "resetCount": 42
}
```

## Contact & Escalation

**Platform Admin Access Required For:**
- Changing subscription tiers
- Manual quota resets
- Viewing cross-tenant statistics

**Engineering Escalation For:**
- Quota system not enforcing
- Email service completely down
- Data inconsistencies in usage tracking

---

**Last Updated:** October 31, 2025  
**Version:** 1.0  
**System:** iRescue.life Multi-Tenant Platform
