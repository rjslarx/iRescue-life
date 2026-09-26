import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface ContestEntrantPhotoProps {
  name: string;
  photoUrl?: string | null;
  className?: string;
}

export default function ContestEntrantPhoto({ name, photoUrl, className }: ContestEntrantPhotoProps) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Avatar
      className={cn(
        "aspect-[4/3] h-auto w-full rounded-[1.5rem] bg-muted after:rounded-[1.5rem]",
        className
      )}
    >
      {photoUrl && (
        <AvatarImage
          src={photoUrl}
          alt={name}
          className="aspect-[4/3] h-full w-full object-cover object-center"
        />
      )}
      <AvatarFallback className="h-full w-full rounded-[1.5rem] text-3xl font-semibold">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}