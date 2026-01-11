# iRescue.life Google OAuth Demo Video Script

**Duration:** ~5-6 minutes  
**Upload as:** Unlisted on YouTube  
**Perspective:** Tenant admin at Haseya's New Beginning Animal Rescue

---

## INTRO (30 seconds)

*[Show browser at iRescue.life landing page]*

> "Hi, I'm the administrator for Haseya's New Beginning Animal Rescue, a nonprofit that uses the iRescue.life platform to manage our rescue operations.
>
> In this video, I'll show how our organization connects Google Workspace to iRescue.life, and demonstrate how each Google API permission is used to help us rescue animals."

*[Navigate to https://irescue.life/haseyas and log in]*

> "iRescue.life is a multi-tenant SaaS platform - meaning many different rescue organizations each have their own space on the platform. I'm logging in now to Haseya's portal."

---

## SECTION 1: OAuth Consent Flow (1 minute)

*[Navigate to Settings → Integrations → Google Workspace]*

> "As the admin for Haseya's New Beginning, I want to connect our organization's Google Workspace so we can use Gmail, Drive, and Calendar directly from iRescue.life."

*[Click 'Connect Google Workspace' button]*

> "When I click Connect, Google's OAuth consent screen appears."

*[IMPORTANT: Show the Google consent screen clearly - it should display "Sign in to iRescue.life"]*

> "Notice that the consent screen says 'iRescue.life wants to access your Google Account' - that's the platform I'm authorizing. I'm logging in with my Haseya organization email."

*[Point to the permissions list]*

> "Google shows me exactly what permissions iRescue.life is requesting:
> - Send email on my behalf via Gmail
> - Access my Google Drive files
> - View and edit my Calendar events
> - Create Chat spaces and send messages
> - View my basic profile information
>
> These permissions are scoped to my Haseya account only."

*[Point to the OAuth client ID in the browser address bar]*

> "The client ID in the address bar confirms this is the official iRescue.life application."

*[Click 'Allow' and show redirect back to iRescue.life]*

> "After I click Allow, I'm redirected back to iRescue.life with a success message. Our Haseya organization is now connected."

---

## SECTION 2: Gmail Send Scope (1 minute)

*[Show the Google Workspace settings page with connected status]*

> "Now that we're connected, I can enable Gmail for sending emails."

*[Toggle 'Use Gmail for sending emails' ON]*

> "With this enabled, all emails from iRescue.life - adoption confirmations, donation receipts, newsletters - will be sent from our actual Gmail address instead of a generic service email."

*[Navigate to Communications → Newsletters]*

> "Let me show you how this works. Here in our newsletter section, I can compose an email to our supporters."

*[Create a quick test newsletter or show existing one]*

> "When I send this, it goes through our connected Gmail account. Recipients see it's from Haseya's New Beginning, not some unknown sender - which dramatically improves our email deliverability."

*[Show confirmation or sent status]*

---

## SECTION 3: Google Drive Scope (1 minute)

*[Navigate back to Settings → Integrations → Google Workspace]*

> "The Drive integration lets us store documents in our organization's Shared Drive."

*[Show Shared Drive dropdown and select a drive]*

> "I can select which of our Shared Drives to use. This is important for nonprofits because when volunteers leave, the files stay with the organization instead of disappearing with personal accounts."

*[Navigate to an animal's profile → Documents section]*

> "Now when I go to one of our rescue animals - let's say Luna here - I can upload documents like her medical records or adoption paperwork."

*[Show document upload or existing files]*

> "These files are stored in our Haseya Shared Drive and accessible to all our authorized team members through both iRescue.life and Google Drive directly."

---

## SECTION 4: Google Calendar Scope (45 seconds)

*[Navigate to Calendar or Events section]*

> "The Calendar integration helps us schedule adoption appointments and volunteer events."

*[Create a new event or show existing calendar]*

> "When I create an adoption interview for a potential adopter, iRescue.life can add it to our Google Calendar automatically."

*[Show event creation with Meet link option]*

> "It even generates a Google Meet link, so we can do virtual home checks or adoption interviews without setting up separate video calls."

*[Show the created event]*

> "The event appears in our Haseya organization calendar, and attendees get proper Google Calendar invites."

---

## SECTION 5: Google Chat Scope (45 seconds)

*[Navigate to Settings → Integrations → Google Workspace]*

> "The Chat integration powers our Collaboration Hub for coordinating animal transports."

*[Toggle 'Use Google Chat for transport coordination' ON]*

*[Navigate to Collaboration Hub → Transports]*

> "When Haseya's New Beginning coordinates with another rescue - say, transporting dogs from an overcrowded shelter to our foster network - iRescue.life can create a Google Chat space for real-time communication."

*[Show transport coordination view]*

> "The Chat space lets both organizations share pickup confirmations, ETAs, and urgent updates. For time-sensitive rescue operations, this real-time coordination saves lives."

---

## SECTION 6: User Info Scope (30 seconds)

*[Navigate back to Settings → Integrations → Google Workspace]*

> "Finally, the basic profile permissions let iRescue.life know which Google account is connected."

*[Point to the connected email display]*

> "You can see it displays my connected email here. This is also used as the 'From' address when sending Gmail messages, so recipients know exactly who's contacting them."

---

## CONCLUSION (30 seconds)

*[Show the disconnect option in settings]*

> "If I ever want to revoke iRescue.life's access, I simply click Disconnect here. This immediately revokes all tokens.

> As the Haseya admin, I'm confident our data is secure. iRescue.life uses AES-256 encryption, each organization's data is completely isolated, and nothing is shared or sold.

> For other rescue organizations considering iRescue.life - once the platform is verified, you'll see this same simple 'Sign in to iRescue.life' consent screen. Just click Allow, and you're connected.

> Thank you for watching!"

---

## Recording Tips

1. **Log in as a Haseya admin** (e.g., robby@haseyasnewbeginningar.com)
2. **Keep the browser address bar visible** during OAuth flow
3. **Verify the consent screen says "iRescue.life"** (not "Haseya")
4. **Toggle Google consent language to English** (bottom-left corner if needed)
5. **Speak clearly** - this is from a real user's perspective
6. **Upload to YouTube as Unlisted**
7. **Submit the YouTube link** in Google Cloud Console

---

## Key Points for Google Verification

**What the video demonstrates:**
- iRescue.life is a multi-tenant SaaS platform for animal rescues
- Haseya's New Beginning Animal Rescue is one customer/tenant using the platform
- The OAuth consent screen shows "iRescue.life" (the platform being verified)
- The user logging in is from the Haseya organization
- Each Google API scope has a clear, demonstrated use case

**After verification:**
- All other rescue organizations (tenants) will see the same "iRescue.life" consent screen
- No additional verification needed per tenant
- Only exception: tenants with strict IT policies blocking third-party apps will need to whitelist iRescue.life's Client ID in their Google Admin Console

---

## Scope Justifications (for Google Cloud Console forms)

### Combined Justification (under 1000 chars)

```
iRescue.life is a SaaS platform for animal rescue organizations.

Gmail (gmail.send): Send adoption confirmations, donation receipts, and newsletters from the org's Gmail for better deliverability.

Drive (drive): Store animal documents in Shared Drives for data continuity when volunteers leave. Full drive scope needed to list Shared Drives.

Calendar (calendar.events): Create adoption appointments and volunteer events with Google Meet links.

Chat (chat.spaces.create, chat.messages, chat.memberships): Coordinate animal transports between organizations via Chat spaces.

User Info (userinfo.email): Identify connected account and set Gmail "From" address.

Data is encrypted (AES-256), isolated per org, never sold. Users can disconnect anytime.
```

### Chat Scope Justification (under 1000 chars)

```
iRescue.life coordinates animal transports between rescue organizations via Google Chat.

Our Collaboration Hub creates Chat spaces when rescues collaborate on animal transfers (e.g., transporting dogs from high-kill shelters to foster homes in other states).

chat.messages is used to:
- Post transport updates (pickup confirmed, animal in transit, arrived safely)
- Share transport manifests and driver information
- Send urgent alerts (SOS) when animals need immediate transport
- Notify participants of schedule changes

This enables real-time coordination for time-sensitive rescue operations. More limited scopes don't allow posting messages to spaces we create.

Messages contain only transport logistics - never personal user data. Organizations can disconnect anytime to revoke access.
```
