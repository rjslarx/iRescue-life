import { Card, CardContent } from "@/components/ui/card";

interface HappyTail {
  id: string;
  animalName: string;
  adopterName: string;
  story: string;
  photo: string;
  date: string;
}

interface HappyTailsCardProps {
  tail: HappyTail;
}

export default function HappyTailsCard({ tail }: HappyTailsCardProps) {
  return (
    <Card className="overflow-hidden" data-testid={`card-happy-tail-${tail.id}`}>
      <div className="overflow-hidden bg-muted">
        <img 
          src={tail.photo} 
          alt={tail.animalName}
          className="w-full h-auto"
        />
      </div>
      <CardContent className="p-6 space-y-3">
        <div>
          <h3 className="font-display text-xl font-semibold">{tail.animalName}</h3>
          <p className="text-sm text-muted-foreground">Adopted by {tail.adopterName}</p>
        </div>
        <p className="text-sm leading-relaxed line-clamp-4">
          {tail.story}
        </p>
        <p className="text-xs text-muted-foreground">{tail.date}</p>
      </CardContent>
    </Card>
  );
}
