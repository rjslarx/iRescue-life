import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, DollarSign, Heart } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  totalDonated: number;
  donationCount: number;
  adoptions: string[];
}

interface ContactCardProps {
  contact: Contact;
  onClick?: () => void;
}

export default function ContactCard({ contact, onClick }: ContactCardProps) {
  return (
    <Card className="hover-elevate cursor-pointer" onClick={onClick} data-testid={`card-contact-${contact.id}`}>
      <CardHeader>
        <CardTitle className="text-xl">{contact.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span>{contact.email}</span>
          </div>
          {contact.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4" />
              <span>{contact.phone}</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <DollarSign className="h-4 w-4" />
              <span>Total Donated</span>
            </div>
            <Badge variant="secondary" className="font-semibold">
              ${contact.totalDonated.toLocaleString()}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {contact.donationCount} donation{contact.donationCount !== 1 ? 's' : ''}
          </div>
        </div>

        {contact.adoptions.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Heart className="h-4 w-4 text-primary" />
              <span>Adoptions</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {contact.adoptions.map((animal, idx) => (
                <Badge key={idx} variant="outline">
                  {animal}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
