import { GoogleGenAI } from "@google/genai";

const geminiApiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
const geminiBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;

const aiConfig: any = {
  apiKey: geminiApiKey || "not-configured",
  ...(geminiBaseUrl && {
    httpOptions: {
      apiVersion: "",
      baseUrl: geminiBaseUrl,
    },
  }),
};

const ai = new GoogleGenAI(aiConfig);

const PLATFORM_CONTEXT = `
You are a script writer for iRescue.life, a multi-tenant SaaS platform for animal rescue organizations.
The platform helps shelters manage animals, adoptions, medical records, fundraising, volunteers, foster care, and more.
Each rescue organization (tenant) gets their own subdomain and a full suite of tools.

When writing scripts:
- Use a warm, professional, and encouraging tone
- Assume the viewer is a shelter staff member or admin who may not be tech-savvy
- Reference specific UI elements by name (sidebar items, buttons, tabs, dialogs)
- Include "what you'll see on screen" cues for the video editor
- Keep each step clear and concise
- Suggest screen recording moments (e.g., "SHOW: Click the 'Add Animal' button")
- Include an intro and outro for each video
- Target video length: 2-4 minutes per script
`;

const FEATURES: Record<string, string> = {
  "Animal Management": `
    Managing animals in the shelter. Covers adding new animals, editing profiles, uploading photos,
    setting status (Available, Adopted, Foster, Hold, Medical Hold), assigning kennel locations,
    and using the animal search/filter system. Animals have a 3-pillar architecture: Status, Location, and Badges.
    Each animal gets a local shelter ID and a global UUID. The main page shows animal cards with photos,
    status badges, and quick actions. Staff can view detailed profiles with medical history, documents, and adoption history.
    Sidebar: Animals section. Key pages: animal list, animal detail/profile.
  `,
  "Kennel Management": `
    The Facility Manager for kennel layout and occupancy. Staff can create buildings (e.g., Main Shelter, Quarantine),
    add rows within buildings with capacity and type (standard, isolation, puppy, cat),
    and assign animals to specific positions. Includes a visual grid view showing occupied/empty kennels,
    a list view, and an edit layout mode. Staff can drag-and-drop or click to assign animals.
    Printable kennel cards can be generated for physical display on cage doors.
    Sidebar: Operations > Kennels. Key pages: Facility Manager, Kennel Cards.
  `,
  "Adoption Pipeline": `
    The full adoption workflow from application to completion. Uses a Kanban-style pipeline with stages:
    New Application, Under Review, Home Check, Approved, Contract Sent, Adopted.
    Staff can review applications, approve with contract templates, send checkout links via email or SMS,
    collect adoption fees through Stripe, and generate adoption packets.
    Supports fast-track adoptions and fee waivers. The system sends automated notifications to adopters.
    Sidebar: Adoptions. Key pages: Adoption Pipeline (Kanban board), individual application review.
  `,
  "Medical Records": `
    Comprehensive medical record management. Covers adding vaccines, diagnostics, procedures, prescriptions,
    and medical exams. Each animal has a Medical Profile page with tabs for different record types.
    Features the Smart Add Medical Order Modal (CPOE) for efficient order entry.
    Includes preventative care tracking, puppy protocol automation, and medical protocol engine.
    All records have edit audit trails with lastEditedAt/lastEditedBy columns.
    The Unified Daily Medical Roster shows all pending medical tasks across the shelter.
    Sidebar: Medical section. Key pages: Animal Medical Profile, Daily Medical Roster, Medical Protocols (Settings).
  `,
  "Foster Care": `
    Foster parent management and the My Fosters portal. Admins can assign animals to foster homes,
    create medication plans with scheduled tasks, and track foster compliance.
    Foster parents access a mobile-first portal showing their current fosters, medication tasks to confirm,
    and animal care instructions. Includes SMS escalation for unconfirmed medication tasks (3-step system:
    hourly digests, evening nudges, dashboard alerts). Staff can override foster medical tasks with audit trails.
    Sidebar: Foster section. Key pages: Foster Management, My Fosters portal.
  `,
  "Fundraising": `
    The Donation & Fundraising Hub with multiple modules:
    1. General donations - accept one-time and recurring donations via Stripe
    2. Animal-targeted fundraising - raise funds for specific animals' medical needs
    3. P2P Campaigns - peer-to-peer fundraising with participant sub-pages, unit-based pledges, and timeline updates
    4. Voting Contests ("Vote with your Dollar") - gamified fundraising where \$1 = 1 Vote
    5. Fundraiser Events & Products - sell items/tickets with QR codes
    Each campaign can have custom theme colors. Public campaign pages at /campaign/:slug.
    Campaign Intake Form allows external partners to self-service create campaigns.
    Sidebar: Fundraising. Key pages: Fundraising Hub, Campaign Manager, public campaign pages.
  `,
  "Volunteer Management": `
    Volunteer coordination system. Manage volunteer profiles, track hours, assign to events and shifts.
    Volunteers can sign up for open shifts via SMS. Includes document management for volunteer agreements
    and background checks. Staff can view volunteer schedules and availability.
    Sidebar: Volunteers section.
  `,
  "Happy Tails": `
    Success stories showcasing adopted animals. Staff create Happy Tails entries with photos, stories,
    and links to the adopted animal's profile. These appear on the organization's public website
    as a gallery of adoption success stories. Cards display with a consistent portrait-style photo layout.
    Helps with community engagement and encourages future adoptions.
    Sidebar: Happy Tails section. Key pages: Happy Tails management, public-facing gallery.
  `,
  "Communications": `
    The Omnichannel Communications Switchboard. A unified admin control panel for managing:
    - Email notifications (adoption updates, medical reminders, daily briefings)
    - SMS messaging (checkout links, medication reminders, volunteer shift signups)
    - SMS logs and queued messages
    - "Pause Outbound Comms" kill switch for emergencies
    - Channel conversion modal (switch adopter from email to SMS or vice versa)
    Includes quiet hours enforcement (8 PM - 6 AM CST for SMS).
    Daily Staff Briefing Email and Pending Applications Digest are automated.
    Sidebar: Communications section.
  `,
  "Contacts": `
    Contact management for all people the rescue interacts with: adopters, fosters, volunteers,
    donors, veterinary partners, and general contacts. Each contact has a profile with history
    of interactions, adoption applications, donations, and volunteer hours.
    Staff can search, filter, and manage contact information.
    Sidebar: Contacts section.
  `,
  "E-Signatures": `
    Native e-signature system for adoption contracts and other documents. Staff create contract templates
    with customizable fields, send contracts for signature via checkout links, and recipients sign
    digitally. Generates legally verifiable PDFs with signature timestamps and IP addresses.
    Templates support custom clauses, terms, and organization branding.
    Sidebar: Settings > Contract Templates. Used within the Adoption Pipeline.
  `,
  "Supplies & Expenditures": `
    Supply registry and expenditure tracking. Manage inventory of shelter supplies (food, medical supplies,
    cleaning products), track spending by category, and monitor budgets.
    Expenditures can be linked to specific animals or general operations.
    Sidebar: Finances section.
  `,
  "Events": `
    Event management for adoption events, fundraisers, volunteer activities, and community outreach.
    Create events with dates, locations, descriptions, and volunteer needs.
    Track RSVPs, manage event-day logistics, and sell tickets/products via the fundraiser module.
    Sidebar: Events section.
  `,
  "Documents & AI Import": `
    Document management with AI-powered PDF auto-import. Upload documents to animal profiles
    (medical records, lab results, transfer papers). The Email PDF Auto-Import system accepts
    forwarded emails with PDF attachments at each tenant's unique system inbound email address,
    automatically downloads and uploads PDFs to object storage, then uses Gemini 2.5 Flash AI
    to parse medical records into structured data for human-in-the-loop approval.
    Reviewed batches auto-save PDFs to the animal's Documents tab.
    Sidebar: Documents section, Medical Import queue.
  `,
  "TNR Log": `
    Trap-Neuter-Return record management integrated within the animal data system.
    Track TNR activities including trap date, location, procedure details, ear tip status,
    and release information. Helps organizations document community cat management efforts
    for grant reporting and compliance.
    Sidebar: TNR section.
  `,
  "Grants Dashboard": `
    Grant Readiness & Compliance Dashboard. Track regulatory deadlines, document flags,
    and intake/outcome statistics with live release rate calculation.
    Monitor grant applications, awards, and reporting requirements.
    Helps shelters stay compliant with grant obligations and prepare for audits.
    Sidebar: Grants section.
  `,
  "Help & Training": `
    Two-tab page for training videos and documents with role-based visibility.
    Admins can upload how-to videos and training documents that are shown to staff
    based on their role (admin, staff, volunteer, foster). Helps onboard new team members
    and provides ongoing reference materials.
    Sidebar: Help & Training section.
  `,
  "Adopter Compliance": `
    Post-adoption compliance tracking engine. Monitors microchip registration reminders,
    spay/neuter deadlines, and other post-adoption obligations. Automated breach escalation
    with notifications and dashboard alerts when adopters miss compliance deadlines.
    Staff can view compliance status per adopter and take action on overdue items.
    Sidebar: Compliance section within Adoptions.
  `,
  "Network Transfers": `
    Tenant-to-tenant animal transfer engine using a Clone-and-Link approach.
    Facilitates transfers between rescue organizations on the platform while preserving
    full medical history. Generates Medical Transfer Packets (PDF) including vaccination history,
    preventative care, and upcoming medical care items.
    Sidebar: Transfers section.
  `,
  "Settings & Configuration": `
    Platform settings including:
    - Organization profile and branding
    - User management and role assignments (RBAC)
    - Medical Protocols customization (treatment intervals)
    - Contract Templates for e-signatures
    - Notification Preferences (event-based notification configuration)
    - Subscription Feature Flags for tier-based features
    - Google Drive backup configuration
    - System inbound email setup for forwarded email routing
    Sidebar: Settings section.
  `,
  "Public Website": `
    Each tenant gets a public-facing website showcasing available animals, accepting donations,
    displaying Happy Tails success stories, and providing organizational information.
    Customizable layouts with organization branding. Includes campaign landing pages,
    event listings, and adoption application forms for the public.
    Accessed via the tenant's subdomain.
  `,
};

async function generateScript(featureName: string, customNotes?: string): Promise<string> {
  const featureKey = Object.keys(FEATURES).find(
    (k) => k.toLowerCase() === featureName.toLowerCase()
  );

  let featureContext: string;
  if (featureKey) {
    featureContext = FEATURES[featureKey];
  } else {
    console.log("\nAvailable features:");
    Object.keys(FEATURES).forEach((k) => console.log(`  - ${k}`));
    console.log(`\n"${featureName}" not found in the feature catalog.`);
    console.log("Using it as a custom topic. The AI will do its best with the platform context.\n");
    featureContext = featureName;
  }

  const prompt = `
${PLATFORM_CONTEXT}

FEATURE TO COVER: ${featureKey || featureName}
FEATURE DETAILS: ${featureContext}
${customNotes ? `\nADDITIONAL NOTES FROM THE CREATOR: ${customNotes}` : ""}

Please write a complete how-to video script for this feature. Structure it as follows:

1. **TITLE** - A clear, searchable title for the video
2. **DURATION** - Estimated video length
3. **TARGET AUDIENCE** - Who this video is for
4. **INTRO** (15-20 seconds) - Welcome, briefly state what they'll learn
5. **MAIN CONTENT** - Step-by-step walkthrough with:
   - NARRATOR lines (what to say)
   - SCREEN CUE lines (what to show on screen, formatted as "SHOW: ...")
   - Tips or callouts where helpful (formatted as "TIP: ...")
6. **RECAP** - Quick summary of what was covered
7. **OUTRO** (10-15 seconds) - Encourage next steps, mention related features

Format the script so it's easy to read and follow during recording.
Use timestamps like [00:00] to help with pacing.
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.7 },
  });

  return response.text || "No content generated.";
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--list") {
    console.log("\n=== iRescue.life How-To Video Script Generator ===\n");
    console.log("Usage:");
    console.log('  npx tsx scripts/generate-video-script.ts "Feature Name"');
    console.log('  npx tsx scripts/generate-video-script.ts "Feature Name" "Optional extra notes"');
    console.log('  npx tsx scripts/generate-video-script.ts --list');
    console.log('  npx tsx scripts/generate-video-script.ts --all\n');
    console.log("Available features:");
    Object.keys(FEATURES).forEach((k) => console.log(`  - ${k}`));
    console.log(
      '\nYou can also provide any custom topic name — the AI will use platform context to generate a script.\n'
    );
    return;
  }

  if (args[0] === "--all") {
    console.log("\n=== Generating scripts for ALL features ===\n");
    const allScripts: string[] = [];

    for (const feature of Object.keys(FEATURES)) {
      console.log(`Generating: ${feature}...`);
      try {
        const script = await generateScript(feature);
        allScripts.push(`\n${"=".repeat(80)}\n${script}\n${"=".repeat(80)}\n`);
        console.log(`  Done.`);
      } catch (err: any) {
        console.error(`  Error generating ${feature}: ${err.message}`);
        allScripts.push(`\n=== ${feature} ===\nERROR: ${err.message}\n`);
      }
    }

    const outputPath = `scripts/output/all-video-scripts-${new Date().toISOString().slice(0, 10)}.txt`;
    const fs = await import("fs");
    const path = await import("path");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, allScripts.join("\n"));
    console.log(`\nAll scripts saved to: ${outputPath}`);
    return;
  }

  const featureName = args[0];
  const customNotes = args[1] || undefined;

  console.log(`\n=== Generating how-to video script for: "${featureName}" ===\n`);

  try {
    const script = await generateScript(featureName, customNotes);
    console.log(script);

    const fs = await import("fs");
    const path = await import("path");
    const safeName = featureName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const outputPath = `scripts/output/${safeName}-${new Date().toISOString().slice(0, 10)}.txt`;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, script);
    console.log(`\nScript also saved to: ${outputPath}`);
  } catch (err: any) {
    console.error(`\nError: ${err.message}`);
    if (err.message.includes("not-configured")) {
      console.error("The Gemini API key is not configured. Check your environment variables.");
    }
  }
}

main();
