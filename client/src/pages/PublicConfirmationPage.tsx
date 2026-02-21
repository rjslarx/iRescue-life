import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Clock, Loader2, Heart } from "lucide-react";

interface ReminderInfo {
  careName: string;
  dueDate: string;
  animalName: string;
  isConfirmed: boolean;
  isExpired: boolean;
  confirmedAt: string | null;
}

interface ConfirmResponse {
  success: boolean;
  message: string;
  alreadyConfirmed?: boolean;
  confirmedAt?: string;
}

export default function PublicConfirmationPage() {
  const { token } = useParams<{ token: string }>();
  const [isComplete, setIsComplete] = useState(false);

  const { data, isLoading, error } = useQuery<ReminderInfo>({
    queryKey: [`/api/compliance/confirm/${token}`],
    enabled: !!token && token.length >= 32,
  });

  const confirmMutation = useMutation<ConfirmResponse, Error>({
    mutationFn: async () => {
      const response = await fetch(`/api/compliance/confirm/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to confirm');
      }
      return response.json();
    },
    onSuccess: () => {
      setIsComplete(true);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md" data-testid="card-loading">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" data-testid="icon-loading" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md" data-testid="card-not-found">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle data-testid="text-not-found-title">Link Not Found</CardTitle>
            <CardDescription data-testid="text-not-found-description">
              This confirmation link is invalid or has already been used.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (data.isExpired) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md" data-testid="card-expired">
          <CardHeader className="text-center">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <CardTitle data-testid="text-expired-title">Link Expired</CardTitle>
            <CardDescription data-testid="text-expired-description">
              This confirmation link has expired. Please contact your rescue organization for assistance.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (data.isConfirmed || isComplete) {
    const formattedDate = data.confirmedAt 
      ? new Date(data.confirmedAt).toLocaleString() 
      : new Date().toLocaleString();

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md" data-testid="card-success">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" data-testid="icon-success" />
            <CardTitle className="text-2xl" data-testid="text-success-title">Thank You!</CardTitle>
            <CardDescription className="text-base mt-2" data-testid="text-success-description">
              {data.isConfirmed && !isComplete
                ? "This item was already confirmed."
                : "Your confirmation has been recorded."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <div className="bg-muted rounded-lg p-4" data-testid="container-animal-info">
              <p className="font-medium text-lg" data-testid="text-animal-name">{data.animalName}</p>
              <p className="text-muted-foreground" data-testid="text-care-name">{data.careName}</p>
              <p className="text-sm text-muted-foreground mt-2" data-testid="text-due-date">
                Due: {new Date(data.dueDate).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
            <p className="text-sm text-muted-foreground" data-testid="text-confirmed-at">
              Confirmed: {formattedDate}
            </p>
            <div className="flex items-center justify-center gap-2 text-muted-foreground pt-4">
              <Heart className="h-4 w-4 text-red-400" />
              <span className="text-sm" data-testid="text-thank-you">Thank you for keeping {data.animalName} healthy!</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dueDate = new Date(data.dueDate);
  const formattedDueDate = dueDate.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric' 
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md" data-testid="card-confirm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl" data-testid="text-confirm-title">Confirm Preventative Care</CardTitle>
          <CardDescription className="text-base mt-2" data-testid="text-confirm-description">
            Please confirm that you've administered or have ready:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted rounded-lg p-6 text-center" data-testid="container-confirm-details">
            <p className="font-semibold text-xl" data-testid="text-confirm-animal-name">{data.animalName}</p>
            <p className="text-lg text-primary mt-2" data-testid="text-confirm-care-name">{data.careName}</p>
            <p className="text-muted-foreground mt-2" data-testid="text-confirm-due-date">
              Due: {formattedDueDate}
            </p>
          </div>

          {confirmMutation.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {confirmMutation.error.message}
              </AlertDescription>
            </Alert>
          )}

          <Button 
            className="w-full h-12 text-lg"
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending}
            data-testid="button-confirm-care"
          >
            {confirmMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Confirming...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-5 w-5" />
                Confirm Complete
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            By clicking confirm, you verify that this care has been or will be administered on the due date.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
