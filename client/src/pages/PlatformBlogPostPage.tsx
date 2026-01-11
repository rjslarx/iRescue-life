import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSEO } from "@/hooks/useSEO";
import { ArrowLeft, PawPrint, Calendar, Clock } from "lucide-react";

export default function PlatformBlogPostPage() {
  const [match, params] = useRoute("/platform/blog/:slug");
  const slug = params?.slug;

  // Blog post data
  const blogPosts: Record<string, any> = {
    "google-for-nonprofits-for-animal-rescues": {
      title: "Stop Juggling Spreadsheets: How Your Animal Rescue Can Get Google Workspace for Free",
      excerpt: "Running an animal rescue is chaotic. See how your 501(c)(3) can get Google Workspace for Nonprofits 100% free, and how it integrates with rescue management software like iRescue.life.",
      date: "January 15, 2025",
      category: "Nonprofit Resources",
      readTime: "8 min read",
      content: `
<p>As a leader in animal rescue, your day is a constant scramble. You're managing foster applications, coordinating vet appointments, tracking animal intakes, scheduling volunteers, and trying to fundraise—all at the same time.</p>

<p>More often than not, this means data is scattered across personal Gmail accounts, messy Excel spreadsheets, and random Word documents. It's chaotic, insecure, and a massive time-sink.</p>

<p>What if you could have a professional, centralized, and secure system for your entire team? And what if it was 100% free?</p>

<p>That's what the Google for Nonprofits program offers. It gives eligible organizations, including 501(c)(3) animal rescues, free access to the full-power Google Workspace (formerly G Suite) and other powerful tools. This creates the perfect foundation for your rescue's digital operations.</p>

<p>Let's break down what this means for your rescue and how you can get it.</p>

<h2>🐾 What Your Rescue Gets with Google Workspace for Nonprofits</h2>

<p>Google Workspace is a suite of cloud-based tools that allows your entire team—volunteers, fosters, and staff—to collaborate from anywhere. The free plan includes:</p>

<h3>Professional Email (Gmail)</h3>
<p>Stop using you.yourrescuename@yahoo.com or you.yourrescuename@aol.com. You can give your team, and even key volunteers, professional email addresses like Amy@yourrescuename.org or Tom@yourrescuename.org. This builds credibility with donors and adopters instantly.</p>

<h3>Massive Cloud Storage (Google Drive)</h3>
<p>You get a whopping 100 TB of pooled storage. This is an enormous amount of space. You can store and share:</p>
<ul>
<li>Every intake photo and video.</li>
<li>Signed adoption contracts and applications.</li>
<li>Scanned vet records and medical files.</li>
<li>Fundraising graphics, logos, and donor letters.</li>
</ul>

<h3>Virtual Meetings (Google Meet)</h3>
<p>Conduct secure video calls with up to 100 participants. This is perfect for digital "meet and greets," virtual foster home checks, or board meetings.</p>

<h3>Shared Calendars (Google Calendar)</h3>
<p>Run your entire operation from a central schedule. You can create separate, shareable calendars for adoption events, vet appointments, or volunteer shifts.</p>

<h3>Collaborative Documents (Docs & Sheets)</h3>
<p>This is where you replace the spreadsheet chaos.</p>
<ul>
<li><strong>Google Docs:</strong> Create and edit adoption applications, foster home agreements, and volunteer handbooks.</li>
<li><strong>Google Sheets:</strong> Move your master animal status list, foster database, or donation tracker to a central, real-time sheet.</li>
</ul>

<h3>Easy Surveys (Google Forms)</h3>
<p>Create slick, professional-looking online forms for adoption applications, foster applications, and volunteer sign-ups.</p>

<h2>How iRescue.life Supercharges Your Free Google Workspace</h2>

<p>Getting Google Workspace is a powerful first step—but here's where it gets really exciting. Instead of juggling between Gmail, Google Drive, Google Calendar, and multiple browser tabs, what if everything worked together in one centralized rescue management platform?</p>

<p>That's exactly what iRescue.life does. It's built from the ground up to integrate seamlessly with Google Workspace for Nonprofits, creating a unified command center for your entire rescue operation.</p>

<h3>📧 Professional Email Integration (Gmail API)</h3>
<p>Once you connect your Google Workspace account to iRescue.life, you unlock unlimited free email sending through Gmail's API—bypassing traditional email service quotas entirely.</p>

<p><strong>Here's what this means in practice:</strong></p>
<ul>
<li><strong>Automatic Application Updates:</strong> When someone submits an adoption application, iRescue.life automatically sends a professional confirmation email from Amy@yourrescue.org—not from a generic noreply address.</li>
<li><strong>Foster Communications:</strong> Send supply request updates, medical alerts, and check-in emails to foster families, all logged automatically in each animal's record.</li>
<li><strong>Newsletter Campaigns:</strong> Send unlimited newsletters to your donor and supporter lists without worrying about hitting send limits or paying per email.</li>
<li><strong>Thread Tracking:</strong> Every email sent through iRescue.life is logged in the contact's history, so your entire team can see the complete communication timeline.</li>
</ul>

<p>The best part? If your rescue hasn't set up Google Workspace yet, iRescue.life still works perfectly with our built-in email service. You can upgrade to Google Workspace integration anytime.</p>

<h3>📅 Calendar Synchronization (Google Calendar API)</h3>
<p>Your rescue's schedule lives in Google Calendar, but your adoptions, fosters, and vet appointments live in iRescue.life. With our integration, they work together seamlessly:</p>

<ul>
<li><strong>Two-Way Sync:</strong> When you schedule a vet appointment in iRescue.life, it automatically appears on your team's shared Google Calendar.</li>
<li><strong>Event Coordination:</strong> Adoption events, volunteer shifts, and transport runs sync to Google Calendar so your team can manage their personal schedules alongside rescue commitments.</li>
<li><strong>Automated Reminders:</strong> Google Calendar sends reminder notifications for upcoming appointments that were scheduled in iRescue.life.</li>
<li><strong>Multiple Calendar Support:</strong> Separate calendars for medical appointments, events, foster home visits, and volunteer schedules—all managed from iRescue.life but visible in Google Calendar.</li>
<li><strong>Automatic Google Meet Links:</strong> When scheduling virtual appointments (like remote home checks or adopter meet-and-greets), iRescue.life can automatically generate and attach Google Meet video conference links to calendar events—no manual setup required.</li>
</ul>

<h3>🎥 Virtual Meetings (Google Meet Integration)</h3>
<p>The pandemic taught animal rescues that virtual meetings can be incredibly valuable. Virtual home visits, remote adopter interviews, and online volunteer orientations save time and expand your geographic reach.</p>

<p>With iRescue.life's Google Meet integration, scheduling virtual appointments is effortless:</p>

<ul>
<li><strong>One-Click Video Links:</strong> When creating a calendar event in iRescue.life, simply check "Add Google Meet link" and a unique video conference URL is automatically generated and attached to the event.</li>
<li><strong>Automatic Distribution:</strong> The Meet link is included in calendar invites and email notifications, so adopters, fosters, and volunteers receive everything they need in one message.</li>
<li><strong>No Extra Setup:</strong> There's no need to manually create meetings in Google Calendar and copy-paste links. iRescue.life handles it all through the Google Meet API.</li>
<li><strong>Professional Experience:</strong> Adopters receive a professional meeting invite with a yourrescue.org email address and an official Google Meet link—building trust and credibility.</li>
</ul>

<p><strong>Real-World Example:</strong> When scheduling a virtual home visit for a potential adopter, your staff member creates the appointment in iRescue.life, checks "Include Meet link," and the system automatically generates a Google Meet URL, adds it to the adopter's calendar invite, and includes it in the confirmation email. On the day of the visit, the adopter simply clicks the link—no confusion, no tech support needed.</p>

<h3>☁️ Cloud Storage Integration (Google Drive API)</h3>
<p>With 100 TB of Google Drive storage at your disposal, iRescue.life helps you put it to work for your rescue:</p>

<ul>
<li><strong>Direct Document Attachment:</strong> Attach signed adoption contracts, vet records, and intake forms from your Google Drive directly to an animal's profile. No downloading and re-uploading.</li>
<li><strong>Automatic Organization:</strong> Files uploaded through iRescue.life can be automatically stored in organized Google Drive folders: one for animals, one for adopters, one for legal documents.</li>
<li><strong>Collaborative Editing:</strong> Staff can open and edit Google Docs templates (like adoption applications or foster agreements) directly from within iRescue.life, then save them back to the animal's file.</li>
<li><strong>Secure Sharing:</strong> Share specific Google Drive documents with adopters or foster families with permission controls—all tracked within iRescue.life.</li>
<li><strong>Version History:</strong> Google Drive's automatic version history means you never lose track of document changes, and you can see who edited what and when.</li>
</ul>

<h3>🔗 Why Integration Matters</h3>
<p>Here's a real-world example of how this all works together:</p>

<p><em>Sarah submits an adoption application for Max, a 2-year-old rescue dog. iRescue.life automatically sends a confirmation email from Lisa@yourrescue.org using Gmail API. The application is logged in Max's profile. Lisa schedules a home visit, which appears on the team's Google Calendar. During the visit, Lisa uploads photos to Max's profile, which are automatically backed up to Google Drive. After approval, Lisa generates an adoption contract from a Google Docs template, has the adopter sign it digitally, and it's saved to both Max's iRescue.life profile and the rescue's Google Drive—all without switching between apps.</em></p>

<p>That's the power of integration. No more copy-pasting between systems. No more wondering where that file is saved. No more switching between five different browser tabs.</p>

<h2>✅ How to Qualify: The 3 Simple Requirements</h2>

<p>Google needs to verify that you are a legitimate non-profit. The eligibility rules are straightforward. Your organization must:</p>

<ol>
<li>Be a registered charitable organization. In the United States, this means you must be a 501(c)(3) organization.</li>
<li>Not be a government entity, hospital, or school. (Animal rescues are almost never in these categories).</li>
<li>Agree to Google's terms of service.</li>
</ol>

<p>That's it. If you have your 501(c)(3) determination letter, you're ready to apply.</p>

<h2>🚀 How to Apply: A Step-by-Step Guide</h2>

<p>The process is simple and takes place in two main phases: getting verified and then activating your products.</p>

<h3>Step 1: Go to the Google for Nonprofits Website</h3>
<p>Start at the official Google for Nonprofits website. Click the "Get Started" button.</p>

<h3>Step 2: Submit Your Verification Request</h3>
<p>Google will ask you to confirm your country and provide basic information about your rescue. This is where you'll prove your non-profit status. Google now partners with an organization called Goodstack to handle this verification. The Google application will guide you to Goodstack's portal, where you will likely need to submit your EIN and 501(c)(3) determination letter.</p>

<h3>Step 3: Wait for Verification (The "Hard" Part)</h3>
<p>This is the only part that requires patience. Goodstack will review your documents to confirm your status. This can take anywhere from 2 to 14 business days. You will receive an email once your organization is approved.</p>

<h3>Step 4: Activate Google Workspace</h3>
<p>Once you get the "You're Approved!" email, log back into your Google for Nonprofits account. You will now see a dashboard of available products.</p>
<p>Find the "Google Workspace for Nonprofits" card and click "Activate."</p>
<p>Google will walk you through setting up your account.</p>
<p><strong>Important:</strong> To use professional email (@yourrescue.org), you will need to own your domain name (e.g., myanimalrescue.org). If you don't have one, you can buy one from any registrar for about $12/year. You will have to add a few "TXT" or "CNAME" records to your domain to prove you own it.</p>

<h3>Step 5: Activate Your Other FREE Tools</h3>
<p>Once you are approved for Google for Nonprofits, don't just stop at Workspace. You also get access to:</p>
<ul>
<li><strong>The Google Ad Grant:</strong> $10,000 per month in free advertising credits to find local adopters, recruit new fosters, and get donations.</li>
<li><strong>YouTube Nonprofit Program:</strong> Premium features for your rescue's YouTube channel, including "Donate" buttons on your videos.</li>
</ul>

<h2>Your 2-Step Plan for a Digital-First Rescue</h2>

<p>Running an animal rescue is hard enough. Don't let disorganized technology make it harder.</p>

<p><strong>Step 1: Get your foundation.</strong> Go to the Google for Nonprofits site today and click "Get Started" to get your free suite of tools.</p>

<p><strong>Step 2: Centralize your operations.</strong> Once your Google tools are in place, the next step is to eliminate the spreadsheets for good. A dedicated rescue management platform like iRescue.life integrates with your new Google account to manage everything—from animal intakes and medical records to foster management and adoption applications—all in one place.</p>

<p><a href="/platform/signup" class="text-primary hover:underline font-semibold">Learn more about iRescue.life's features and start your free trial today.</a></p>
      `
    }
  };

  const post = slug ? blogPosts[slug] : null;

  useSEO({
    title: post ? `${post.title} - iRescue.life Blog` : "Blog Post - iRescue.life",
    description: post?.excerpt || "Read our latest blog post about animal rescue management.",
    siteName: "iRescue.life",
  });

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Blog post not found</h1>
          <Link href="/platform/blog">
            <Button>Back to Blog</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
        <div className="container max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/platform">
              <a className="flex items-center gap-2 hover:opacity-80 transition-opacity" data-testid="link-home">
                <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
                  <PawPrint className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="font-display font-bold text-xl">iRescue.life</span>
              </a>
            </Link>
            <Link href="/platform/blog">
              <Button variant="ghost" size="sm" data-testid="button-back-blog">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Blog
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Article */}
      <article className="container max-w-4xl mx-auto px-6 py-12 sm:py-16">
        {/* Meta Info */}
        <div className="mb-8">
          <Badge variant="secondary" className="mb-4" data-testid="badge-category">
            {post.category}
          </Badge>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold mb-6" data-testid="heading-title">
            {post.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span data-testid="text-date">{post.date}</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span data-testid="text-read-time">{post.readTime}</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div 
          className="prose prose-lg max-w-none
            prose-headings:font-display prose-headings:font-bold
            prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4
            prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
            prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:mb-6
            prose-ul:text-muted-foreground prose-ul:my-6
            prose-ol:text-muted-foreground prose-ol:my-6
            prose-li:my-2
            prose-strong:text-foreground prose-strong:font-semibold
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
          dangerouslySetInnerHTML={{ __html: post.content }}
          data-testid="article-content"
        />

        {/* CTA */}
        <div className="mt-12 p-8 bg-muted/30 rounded-lg border text-center">
          <h3 className="font-display text-2xl font-bold mb-4">
            Ready to Transform Your Rescue?
          </h3>
          <p className="text-muted-foreground mb-6 text-lg">
            Start your free trial today and see how iRescue.life can streamline your operations.
          </p>
          <Link href="/platform/signup">
            <Button size="lg" data-testid="button-start-trial">
              Start Free Trial
            </Button>
          </Link>
        </div>
      </article>

      {/* Footer */}
      <footer className="border-t py-8 bg-muted/30 mt-12">
        <div className="container max-w-7xl mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Turbeau, LLC. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
