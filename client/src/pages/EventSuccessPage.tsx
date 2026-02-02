import { CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/contexts/TenantContext";

export default function EventSuccessPage() {
  const { basePath } = useTenant();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="flex justify-center">
            <CheckCircle className="h-16 w-16 text-green-500" data-testid="icon-success" />
          </div>
          <h1 className="text-2xl font-bold" data-testid="text-success-title">
            Thank You!
          </h1>
          <p className="text-muted-foreground" data-testid="text-success-message">
            Your event ticket purchase was successful. You will receive a confirmation email shortly.
          </p>
          <Button 
            variant="outline" 
            onClick={() => window.location.href = basePath || '/'}
            data-testid="button-return-home"
          >
            Return to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
