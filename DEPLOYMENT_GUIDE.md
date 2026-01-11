# iRescue.life Deployment Guide

This guide covers all the steps needed to deploy the iRescue.life multi-tenant SaaS platform to production on Replit.

## Pre-Deployment Checklist

### 1. Environment Variables Configuration

Before deploying, ensure all production environment variables are set in Replit's Secrets tool.

#### Required Secrets (CRITICAL)

```bash
# Security - MUST be 32+ characters, cryptographically random
SESSION_SECRET=<generate-with: openssl rand -base64 32>
ENCRYPTION_KEY=<generate-with: openssl rand -base64 32>

# Database (auto-configured by Replit PostgreSQL)
DATABASE_URL=<automatically-set-by-replit>
PGHOST=<automatically-set-by-replit>
PGUSER=<automatically-set-by-replit>
PGDATABASE=<automatically-set-by-replit>
PGPASSWORD=<automatically-set-by-replit>
PGPORT=<automatically-set-by-replit>

# CORS Security - REQUIRED in production
# Format: comma-separated list of allowed origins
ALLOWED_ORIGINS=https://irescue.life,https://platform.irescue.life,https://www.irescue.life,https://*.irescue.life

# Node Environment
NODE_ENV=production
```

#### Payment Processing (Stripe - Production Keys)

```bash
# Production Stripe Keys (replace test keys)
STRIPE_SECRET_KEY=sk_live_...
VITE_STRIPE_PUBLIC_KEY=pk_live_...

# Testing Stripe Keys (for development/testing)
TESTING_STRIPE_SECRET_KEY=sk_test_...
TESTING_VITE_STRIPE_PUBLIC_KEY=pk_test_...
```

#### Email Service (Resend)

```bash
# Platform-wide email service (recommended)
PLATFORM_RESEND_API_KEY=re_...

# Or allow tenants to bring their own key
RESEND_API_KEY=re_...
```

#### Object Storage (auto-configured by Replit)

```bash
DEFAULT_OBJECT_STORAGE_BUCKET_ID=<automatically-set-by-replit>
PUBLIC_OBJECT_SEARCH_PATHS=<automatically-set-by-replit>
PRIVATE_OBJECT_DIR=<automatically-set-by-replit>
```

#### Optional Payment Processors

```bash
# PayPal (optional)
PAYPAL_CLIENT_ID=<your-paypal-client-id>
PAYPAL_CLIENT_SECRET=<your-paypal-client-secret>
```

---

## 2. Custom Domain Setup

### DNS Configuration for irescue.life

You'll need to configure DNS records at your domain registrar (e.g., Cloudflare, GoDaddy, Namecheap).

#### Step 1: Get Replit Deployment IP

After publishing your app on Replit:
1. Go to the Publishing/Deployments tab
2. Click "Add Custom Domain"
3. Note the IP address provided by Replit

#### Step 2: Add DNS Records

Add these records at your DNS provider:

**Root Domain (irescue.life):**
```
Type: A
Name: @
Value: <replit-ip-address>
TTL: Auto or 3600
```

**Platform Subdomain (platform.irescue.life):**
```
Type: A
Name: platform
Value: <replit-ip-address>
TTL: Auto or 3600
```

**WWW Subdomain (www.irescue.life):**
```
Type: A
Name: www
Value: <replit-ip-address>
TTL: Auto or 3600
```

**Wildcard Subdomain for Multi-Tenant (*.irescue.life):**
```
Type: A
Name: *
Value: <replit-ip-address>
TTL: Auto or 3600
```

**Domain Verification TXT Record:**
```
Type: TXT
Name: @ (or as specified by Replit)
Value: <replit-verification-code>
TTL: Auto or 3600
```

#### Step 3: Verify Domain in Replit

1. In Replit's Publishing tool, enter your domain: `irescue.life`
2. Add the TXT record provided by Replit
3. Wait for verification (can take up to 48 hours for DNS propagation)
4. Replit will automatically provision SSL/TLS certificates

#### Important Notes:

- **Wildcard DNS Support**: While Replit doesn't explicitly document wildcard subdomain support, adding a wildcard `A` record (`*.irescue.life`) should work for multi-tenant subdomains.
- **Alternative**: If wildcard doesn't work, you'll need to add individual `A` records for each tenant subdomain (e.g., `demo.irescue.life`, `rescue1.irescue.life`, etc.)
- **SSL Certificates**: Replit auto-provisions Let's Encrypt certificates for your custom domain and all subdomains
- **Cloudflare Proxy**: If using Cloudflare, disable the proxy (gray cloud) during initial setup to allow Replit's certificate renewal

---

## 3. Stripe Production Configuration

### Switch from Test to Production

The application currently uses Stripe test price IDs. Before deploying:

1. **In Stripe Dashboard**, ensure you have created three subscription products:
   - **Starter Plan**: $12/month
   - **Professional Plan**: $39/month  
   - **Enterprise Plan**: $99/month

2. **Note the Production Price IDs**:
   - Look like `price_live_...`
   - Copy each price ID from the Stripe Dashboard

3. **Update Code** (already done if you ran the deployment preparation):
   - Production price IDs are already configured in `server/routes.ts`
   - Test price IDs remain available for development

4. **Set Environment Variables**:
   ```bash
   STRIPE_SECRET_KEY=sk_live_...
   VITE_STRIPE_PUBLIC_KEY=pk_live_...
   ```

### Stripe Webhook Configuration

After deployment, configure the Stripe webhook:

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://platform.irescue.life/api/stripe/webhook`
3. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the webhook signing secret
5. Add to Replit Secrets: `STRIPE_WEBHOOK_SECRET=whsec_...`

---

## 4. Deployment Type Selection

Choose the appropriate Replit deployment type:

### Recommended: Autoscale Deployment

**Best for**: SaaS platforms with variable traffic

**Configuration**:
- **Machine Power**: Start with 0.5 vCPU / 1 GB RAM
- **Max Machines**: 3-5 machines initially
- **Min Machines**: 0 (scale to zero during low traffic)

**Pros**:
- Automatic scaling based on demand
- Cost-effective (pay only for actual usage)
- Handles traffic spikes automatically

**Cons**:
- Cold start latency (mitigated with min machines > 0)
- No persistent filesystem (uses DB + Object Storage ✅)

### Alternative: Reserved VM Deployment

**Best for**: Predictable, steady traffic

**Configuration**:
- Fixed resources (e.g., 1 vCPU / 2 GB RAM)
- Always-on

**Pros**:
- No cold starts
- Predictable performance
- Consistent baseline cost

**Cons**:
- Higher fixed cost
- Manual scaling required

---

## 5. CORS Configuration

The application automatically configures CORS based on environment:

**Development**: Allows `localhost` and `*.replit.dev`

**Production**: Requires `ALLOWED_ORIGINS` environment variable

Set `ALLOWED_ORIGINS` to include all domains/subdomains:
```bash
ALLOWED_ORIGINS=https://irescue.life,https://platform.irescue.life,https://www.irescue.life
```

For wildcard subdomain support, the application includes pattern matching in `server/config/security.ts`.

---

## 6. Session Cookie Configuration

Already configured for production in `server/middleware/auth.ts`:

```typescript
cookie: {
  domain: '.irescue.life',     // Allows all subdomains
  secure: true,                 // HTTPS only in production
  httpOnly: true,               // Prevent XSS
  sameSite: 'lax',             // CSRF protection
  maxAge: 7 days
}
```

No changes needed - automatically activates when `NODE_ENV=production`.

---

## 7. Database Setup

### Pre-Deployment

1. **Backup Current Data** (if migrating from dev):
   ```bash
   # Use Replit's database backup feature or:
   pg_dump $DATABASE_URL > backup.sql
   ```

2. **Schema Sync**:
   - The application uses Drizzle ORM
   - Schema changes are applied automatically on startup
   - No manual migrations needed

3. **Seed Data**:
   - `server/seed.ts` is disabled in production (`NODE_ENV=production`)
   - Create initial platform admin manually or via secure script

### Post-Deployment

Monitor the application logs for database connection issues:
```bash
✅ Database connected successfully
✅ Environment validation passed
```

---

## 8. Security Hardening

### Already Implemented ✅

- **Rate Limiting**: Active in production (disabled in development)
- **Helmet Security Headers**: Strict CSP, XSS protection, frame deny
- **CORS Fail-Closed**: Rejects requests without valid origin in production
- **HTTPS Enforcement**: Secure cookies, upgrade insecure requests
- **Session Security**: HttpOnly, secure, SameSite cookies
- **Input Validation**: Zod schemas on all API endpoints
- **SQL Injection Protection**: Drizzle ORM parameterized queries
- **XSS Protection**: Content Security Policy, sanitized outputs

### Additional Recommendations

1. **Remove Demo Credentials**:
   - Do not use `admin@demo.com` / `ChangeMeInProduction123!` in production
   - Create secure platform admin account after deployment

2. **Monitor Logs**:
   - Use Replit's logging dashboard
   - Set up alerts for errors/crashes

3. **Regular Updates**:
   - Keep dependencies updated
   - Monitor security advisories

---

## 9. Post-Deployment Verification

After deploying, verify the following:

### Domain & SSL
- [ ] `https://irescue.life` loads successfully
- [ ] `https://platform.irescue.life` shows platform landing page
- [ ] `https://www.irescue.life` redirects or loads
- [ ] `https://demo.irescue.life` shows demo tenant home page
- [ ] SSL certificate is valid (green padlock)
- [ ] No mixed content warnings

### Authentication & Sessions
- [ ] Can create new account on platform signup
- [ ] Email verification works (if enabled)
- [ ] Can log in to tenant dashboard
- [ ] Session persists across page reloads
- [ ] Session works across subdomains (platform ↔ tenant)
- [ ] Logout works correctly

### Multi-Tenant Functionality
- [ ] Can create new tenant from platform signup
- [ ] Tenant subdomain resolves correctly
- [ ] Tenant isolation works (can't access other tenant data)
- [ ] Custom branding applies per tenant
- [ ] Tenant subscription limits enforce correctly

### Payment Processing (Stripe)
- [ ] Platform signup redirects to Stripe Checkout
- [ ] Can complete test payment with Stripe test card
- [ ] Subscription creates successfully
- [ ] Webhook receives events from Stripe
- [ ] Subscription status updates in database
- [ ] Subscription limits apply based on tier

### Email Functionality
- [ ] Platform can send system emails (invitations, etc.)
- [ ] Tenants can send email campaigns (if configured)
- [ ] Email quota tracking works
- [ ] Email unsubscribe links work

### Object Storage
- [ ] Can upload animal photos
- [ ] Can upload custom page images
- [ ] Can upload documents
- [ ] Images display correctly on public pages
- [ ] Presigned URLs work for private files

### Performance
- [ ] Average page load time < 2 seconds
- [ ] API response time < 500ms
- [ ] No console errors in browser
- [ ] Mobile responsive design works

---

## 10. Monitoring & Analytics

### Replit Built-in Monitoring

Access via Publishing → Analytics:
- Page views
- Response times
- Error rates
- Traffic patterns
- Resource usage

### Application Logs

Monitor for:
- Database connection errors
- API errors (500 status codes)
- Authentication failures
- Payment processing errors
- Email delivery failures

### Custom Monitoring (Optional)

Consider integrating:
- **Sentry** for error tracking
- **LogRocket** for session replay
- **Google Analytics** for user analytics
- **Stripe Dashboard** for payment analytics

---

## 11. Scaling Considerations

### Database Performance

If experiencing slow queries:
- Add indexes on frequently queried columns
- Use database query optimization
- Consider read replicas for high traffic

### Object Storage

Replit Object Storage automatically scales:
- No configuration needed
- Monitor usage via Replit dashboard

### Application Scaling

For Autoscale deployments:
- Increase max machines during high traffic
- Adjust machine power (CPU/RAM) based on load
- Monitor response times and adjust

---

## 12. Backup Strategy

### Database Backups

Replit automatically backs up PostgreSQL databases:
- Point-in-time recovery available
- Daily snapshots retained
- Manual backups via database tools

### Code Backups

- Git repository on Replit auto-saves
- Consider mirroring to GitHub/GitLab
- Tag production releases

### Object Storage Backups

- Replit Object Storage is durable
- Consider periodic exports for critical files
- Use Google Cloud Storage sync if needed

---

## 13. Rollback Plan

If deployment fails:

1. **Use Replit Rollback Feature**:
   - Go to Publishing → Deployments
   - Select previous working deployment
   - Click "Rollback"

2. **Code Rollback**:
   - Git revert to previous commit
   - Redeploy

3. **Database Rollback**:
   - Use Replit's database restore
   - Restore from backup snapshot

---

## 14. Launch Checklist

Final checklist before making the platform public:

- [ ] All environment variables set correctly
- [ ] Custom domain configured and verified
- [ ] SSL certificates active
- [ ] Stripe production mode enabled
- [ ] Production price IDs configured
- [ ] Stripe webhook configured
- [ ] Email service configured
- [ ] CORS origins configured
- [ ] Demo/test credentials removed
- [ ] Platform admin account created
- [ ] All features tested on production
- [ ] Performance benchmarks acceptable
- [ ] Monitoring/logging configured
- [ ] Backup strategy in place
- [ ] Support documentation prepared
- [ ] Terms of Service and Privacy Policy published
- [ ] Status page/incident communication plan

---

## 15. Post-Launch

After successful launch:

1. **Monitor First 24 Hours**:
   - Watch error logs closely
   - Monitor performance metrics
   - Be ready for quick fixes

2. **User Onboarding**:
   - Provide setup guides for first tenants
   - Offer white-glove onboarding for early adopters
   - Collect feedback actively

3. **Marketing**:
   - Announce launch
   - Update marketing site
   - Enable SEO tracking

4. **Continuous Improvement**:
   - Monitor user feedback
   - Track feature requests
   - Plan regular updates

---

## Support & Resources

- **Replit Docs**: https://docs.replit.com
- **Stripe Docs**: https://stripe.com/docs
- **Application Logs**: Replit Dashboard → Tools → Logs
- **Database Console**: Replit Dashboard → Tools → Database

---

## Troubleshooting Common Issues

### Issue: Subdomain not resolving

**Solution**: 
- Verify DNS `A` record for subdomain
- Check wildcard `*` record exists
- Wait for DNS propagation (up to 48 hours)
- Use `dig demo.irescue.life` to check DNS

### Issue: Session not persisting across subdomains

**Solution**:
- Verify `NODE_ENV=production` is set
- Check cookie domain is `.irescue.life` (with leading dot)
- Ensure HTTPS is enabled (secure cookies)

### Issue: Stripe webhook not receiving events

**Solution**:
- Verify webhook URL is correct: `https://platform.irescue.life/api/stripe/webhook`
- Check webhook signing secret is set
- View webhook logs in Stripe Dashboard
- Test with Stripe CLI: `stripe trigger payment_intent.succeeded`

### Issue: CORS errors

**Solution**:
- Verify `ALLOWED_ORIGINS` includes your domain
- Check format: `https://irescue.life` (no trailing slash)
- Ensure protocol matches (https vs http)
- Check browser console for exact origin being blocked

### Issue: Email not sending

**Solution**:
- Verify `PLATFORM_RESEND_API_KEY` is set
- Check Resend dashboard for delivery logs
- Ensure "from" email is verified in Resend
- Check email quota hasn't been exceeded

---

**Deployment Date**: _________________

**Deployed By**: _________________

**Version/Commit**: _________________

**Notes**: _________________
