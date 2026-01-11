import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, 
  Eye,
  Stethoscope, 
  Users, 
  Heart,
  DollarSign,
  Zap,
  ArrowRight
} from "lucide-react";

import beforeAfterImage from "@assets/image_1764168592040.png";

interface BlogModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartTrial?: () => void;
}

export function BlogModal({ open, onOpenChange, onStartTrial }: BlogModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary" className="text-xs">
              Featured Article
            </Badge>
            <span className="text-xs text-muted-foreground">6 min read</span>
          </div>
          <DialogTitle className="text-2xl font-bold leading-tight">
            The Rescue Founder's Dilemma: Drowning in Apps While Trying to Save Lives
          </DialogTitle>
        </DialogHeader>

        <article className="prose prose-sm dark:prose-invert max-w-none space-y-5 text-foreground">
          
          <p className="text-base leading-relaxed">
            You started your dog rescue because you have a passion for saving lives. You wanted to be on the ground, pulling dogs from shelters, rehabilitating them, and finding their forever homes.
          </p>

          <p className="text-base leading-relaxed">
            You probably didn't start a rescue because you love managing fifteen different spreadsheets, chasing down volunteers via text message, hunting through emails for medical records, and trying to remember which password gets you into your website editor.
          </p>

          <p className="text-base leading-relaxed">
            If that sounds familiar, you are suffering from <strong>administrative fragmentation</strong>. It's the silent killer of rescue efficiency. When crucial information—from intake stats to foster availability—is scattered across half a dozen different platforms, things fall through the cracks.
          </p>

          <p className="text-base leading-relaxed">
            At iRescue.life, we believe rescue administrators shouldn't have to be IT experts just to run their organizations. We built a single, centralized platform designed to replace the tangle of apps you're currently using.
          </p>

          {/* Before/After Comparison Image */}
          <div className="my-6 rounded-lg overflow-hidden border border-border">
            <img 
              src={beforeAfterImage} 
              alt="Before: Drowning in Apps vs After: iRescue.life - showing the transformation from chaotic multiple apps to one unified platform"
              className="w-full h-auto"
              data-testid="img-before-after-comparison"
            />
          </div>

          <p className="text-base leading-relaxed font-medium">
            Here is how moving to an all-in-one system transforms your daily operations.
          </p>

          {/* Section 1 */}
          <div className="border-l-4 border-[#5B7B6B] pl-4 my-6">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="h-5 w-5 text-[#5B7B6B]" />
              <h3 className="text-lg font-bold text-foreground m-0">1. Total Operational Oversight (From Public to Private)</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground mt-2 mb-0">
              As an administrator, you need a 30,000-foot view of your organization at all times. iRescue.life provides a seamless connection between your public face and your internal reality. You can manage your public-facing homepage to showcase adoptable dogs, while simultaneously tracking internal statistics, animal locations across your network, and intake trends in the backend. No more double-entry of data between your website and your internal records.
            </p>
          </div>

          {/* Section 2 */}
          <div className="border-l-4 border-[#5B7B6B] pl-4 my-6">
            <div className="flex items-center gap-2 mb-2">
              <Stethoscope className="h-5 w-5 text-[#5B7B6B]" />
              <h3 className="text-lg font-bold text-foreground m-0">2. Centralized Medical Records</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground mt-2 mb-0">
              A dog's medical history should never be a mystery. With iRescue.life, every vaccination, every vet visit, every medication, and every procedure is logged in one place and tied directly to the animal's profile. When a foster parent needs to take a dog to the vet, the information is accessible instantly. When a potential adopter asks about a dog's health background, you have answers at your fingertips—not buried in an email thread from six months ago.
            </p>
          </div>

          {/* Section 3 */}
          <div className="border-l-4 border-[#5B7B6B] pl-4 my-6">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-[#5B7B6B]" />
              <h3 className="text-lg font-bold text-foreground m-0">3. Staff & Volunteer Coordination Without the Chaos</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground mt-2 mb-0">
              Coordinating a team of volunteers is one of the biggest operational challenges for any rescue. Who's available this weekend for transport? Who signed up for the adoption event? iRescue.life replaces the group text chains and the outdated shared Google Sheets with a real scheduling and communication system. Volunteers can see opportunities, sign up for shifts, and receive automated reminders—all in one place.
            </p>
          </div>

          {/* Section 4 */}
          <div className="border-l-4 border-[#5B7B6B] pl-4 my-6">
            <div className="flex items-center gap-2 mb-2">
              <Heart className="h-5 w-5 text-[#5B7B6B]" />
              <h3 className="text-lg font-bold text-foreground m-0">4. Foster Program Management That Actually Works</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground mt-2 mb-0">
              Your foster network is the backbone of your rescue. Managing it shouldn't require a degree in project management. iRescue.life allows you to onboard foster families, match them with animals, track placement history, and receive updates—all through a dedicated foster portal. Fosters can submit check-in photos, request supplies, and communicate directly through the platform, eliminating the back-and-forth of personal texts and emails.
            </p>
          </div>

          {/* Section 5 */}
          <div className="border-l-4 border-[#5B7B6B] pl-4 my-6">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-5 w-5 text-[#5B7B6B]" />
              <h3 className="text-lg font-bold text-foreground m-0">5. Financial & Donation Tracking in One Dashboard</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground mt-2 mb-0">
              Managing nonprofit finances is stressful enough without having to export data from different donation platforms and manually reconcile them in a spreadsheet. iRescue.life integrates with Stripe and alternative payment methods, consolidating your donation data and giving you real-time insight into your financial health. Track donor history, manage recurring gifts, and generate reports for your board—all from one place.
            </p>
          </div>

          {/* Section 6 */}
          <div className="border-l-4 border-[#5B7B6B] pl-4 my-6">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-5 w-5 text-[#5B7B6B]" />
              <h3 className="text-lg font-bold text-foreground m-0">6. Powerful Integrations That Multiply Your Impact</h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground mt-2 mb-0">
              We've built integrations with the tools nonprofits already rely on. Google Workspace syncs your calendars and documents. Built-in e-signatures handle legally binding adoption contracts. SMS alerts keep your transport network informed. And our AI assistant helps you generate content, answer questions, and streamline workflows—so you can focus on the animals instead of the admin.
            </p>
          </div>

          {/* Call to Action Box */}
          <div className="bg-[#5B7B6B]/10 rounded-lg p-5 border border-[#5B7B6B]/20 my-6">
            <h4 className="font-bold text-[#5B7B6B] mb-3">The Bottom Line</h4>
            <p className="text-sm leading-relaxed text-muted-foreground mb-3">
              Every hour you spend wrestling with disconnected apps is an hour you're not spending on your mission. iRescue.life was built by rescue volunteers who understood this firsthand. We created a platform that brings everything together so you can get back to what matters most: saving lives.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground mb-0">
              Start your free 30-day trial today. No credit card required. Let's get back to saving lives, together.
            </p>
          </div>

          {onStartTrial && (
            <div className="pt-2">
              <Button 
                onClick={() => {
                  onOpenChange(false);
                  onStartTrial();
                }}
                className="w-full bg-[#5B7B6B] hover:bg-[#4a6a5a] text-white"
                data-testid="button-start-trial-blog"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Start Your Free 30-Day Trial
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}
        </article>
      </DialogContent>
    </Dialog>
  );
}
