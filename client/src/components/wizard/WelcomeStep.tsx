import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, Heart, Users, Calendar, Mail, TrendingUp } from "lucide-react";

interface WelcomeStepProps {
  onNext: () => void;
}

export default function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold">Welcome to iRescue.life!</h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          You're about to create a comprehensive website for your rescue organization. 
          This wizard will help you set up everything you need to showcase adoptable animals, 
          accept donations, and manage your team.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-8">
        <Card>
          <CardHeader>
            <Heart className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Animal Profiles</CardTitle>
            <CardDescription>
              Showcase adoptable animals with photos, bios, and medical records
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <Mail className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Email Campaigns</CardTitle>
            <CardDescription>
              Send newsletters and updates to your supporters and adopters
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <Users className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Team Management</CardTitle>
            <CardDescription>
              Invite staff, volunteers, and foster parents with role-based access
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <Calendar className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Events & Calendar</CardTitle>
            <CardDescription>
              Organize adoption events, fundraisers, and volunteer activities
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <TrendingUp className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">Analytics & Reports</CardTitle>
            <CardDescription>
              Track adoptions, donations, and measure your impact
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <Sparkles className="h-8 w-8 text-primary mb-2" />
            <CardTitle className="text-lg">AI Assistant</CardTitle>
            <CardDescription>
              Get help anytime with our AI-powered assistant
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="text-center pt-4">
        <p className="text-sm text-muted-foreground mb-4">
          This setup takes about 5-10 minutes. You can save and come back later at any time.
        </p>
      </div>
    </div>
  );
}
