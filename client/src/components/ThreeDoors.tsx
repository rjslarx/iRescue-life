import { Link } from "wouter";
import { PawPrint, Home, Heart } from "lucide-react";

interface ThreeDoorsProps {
  basePath?: string;
}

interface DoorProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  linkText: string;
  linkUrl: string;
  colorClass: string;
  textColorClass: string;
}

function Door({ icon, title, description, linkText, linkUrl, colorClass, textColorClass }: DoorProps) {
  return (
    <Link href={linkUrl}>
      <div 
        className="group flex flex-col items-center text-center cursor-pointer transition-transform hover:-translate-y-1"
        data-testid={`door-${title.toLowerCase()}`}
      >
        <div 
          className={`w-full rounded-t-lg ${colorClass} py-3 px-4 flex items-center justify-center gap-2`}
        >
          <span className={textColorClass}>{icon}</span>
          <span className={`${textColorClass} font-bold text-lg uppercase tracking-wide`}>{title}</span>
        </div>
        <div className="bg-card rounded-b-lg shadow-lg py-4 px-6 w-full border border-t-0">
          <p className="text-muted-foreground text-sm mb-2">{description}</p>
          <span className="text-primary font-semibold text-sm hover:underline">
            [ {linkText} ]
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function ThreeDoors({ basePath = '' }: ThreeDoorsProps) {
  const doors: Omit<DoorProps, 'colorClass' | 'textColorClass'>[] = [
    {
      icon: <PawPrint className="h-5 w-5" />,
      title: "Adopt",
      description: "Find a friend.",
      linkText: "See Pets >",
      linkUrl: `${basePath}/animals`,
    },
    {
      icon: <Home className="h-5 w-5" />,
      title: "Foster",
      description: "Save a life.",
      linkText: "Apply Now >",
      linkUrl: `${basePath}/foster`,
    },
    {
      icon: <Heart className="h-5 w-5" />,
      title: "Volunteer",
      description: "Help us out.",
      linkText: "Get Involved >",
      linkUrl: `${basePath}/volunteer`,
    },
  ];

  return (
    <div className="w-full py-4">
      <div className="text-center mb-4">
        <p className="text-white/70 text-xs uppercase tracking-wider">Action Grid</p>
        <p className="text-white font-bold text-sm uppercase tracking-wide">The Three Doors</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto px-4">
        <Door {...doors[0]} colorClass="bg-primary" textColorClass="text-primary-foreground" />
        <Door {...doors[1]} colorClass="bg-accent" textColorClass="text-accent-foreground" />
        <Door {...doors[2]} colorClass="bg-muted" textColorClass="text-muted-foreground" />
      </div>
    </div>
  );
}
