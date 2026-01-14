import { Link } from "wouter";
import { PawPrint, Home, Heart, DollarSign } from "lucide-react";

type IconType = 'paw' | 'home' | 'heart' | 'dollar';

interface DoorConfig {
  title?: string;
  description?: string;
  linkText?: string;
  linkUrl?: string;
  icon?: IconType;
}

interface ThreeDoorsConfig {
  door1?: DoorConfig;
  door2?: DoorConfig;
  door3?: DoorConfig;
}

interface ThreeDoorsProps {
  basePath?: string;
  config?: ThreeDoorsConfig;
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

const ICONS: Record<IconType, React.FC<{ className?: string }>> = {
  paw: PawPrint,
  home: Home,
  heart: Heart,
  dollar: DollarSign,
};

function Door({ icon, title, description, linkText, linkUrl, colorClass, textColorClass }: DoorProps) {
  return (
    <Link href={linkUrl}>
      <div 
        className="group flex flex-col items-center text-center cursor-pointer transition-transform hover:-translate-y-1"
        data-testid={`door-${title.toLowerCase().replace(/\s+/g, '-')}`}
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

const DEFAULT_DOORS: { config: Required<DoorConfig>; colorClass: string; textColorClass: string }[] = [
  {
    config: {
      title: "Adopt",
      description: "Find a friend.",
      linkText: "See Pets >",
      linkUrl: "/animals",
      icon: "paw",
    },
    colorClass: "bg-primary",
    textColorClass: "text-primary-foreground",
  },
  {
    config: {
      title: "Foster",
      description: "Save a life.",
      linkText: "Apply Now >",
      linkUrl: "/foster",
      icon: "home",
    },
    colorClass: "bg-accent",
    textColorClass: "text-accent-foreground",
  },
  {
    config: {
      title: "Volunteer",
      description: "Help us out.",
      linkText: "Get Involved >",
      linkUrl: "/volunteer",
      icon: "heart",
    },
    colorClass: "bg-muted",
    textColorClass: "text-muted-foreground",
  },
];

export default function ThreeDoors({ basePath = '', config }: ThreeDoorsProps) {
  const doorConfigs = [config?.door1, config?.door2, config?.door3];

  return (
    <div className="w-full py-4">
      <div className="text-center mb-4">
        <p className="text-white/70 text-xs uppercase tracking-wider">Action Grid</p>
        <p className="text-white font-bold text-sm uppercase tracking-wide">The Three Doors</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto px-4">
        {DEFAULT_DOORS.map((defaultDoor, index) => {
          const customConfig = doorConfigs[index];
          const title = customConfig?.title || defaultDoor.config.title;
          const description = customConfig?.description || defaultDoor.config.description;
          const linkText = customConfig?.linkText || defaultDoor.config.linkText;
          const linkUrl = customConfig?.linkUrl 
            ? `${basePath}${customConfig.linkUrl.startsWith('/') ? customConfig.linkUrl : '/' + customConfig.linkUrl}`
            : `${basePath}${defaultDoor.config.linkUrl}`;
          const iconType = customConfig?.icon || defaultDoor.config.icon;
          const IconComponent = ICONS[iconType];

          return (
            <Door
              key={index}
              icon={<IconComponent className="h-5 w-5" />}
              title={title}
              description={description}
              linkText={linkText}
              linkUrl={linkUrl}
              colorClass={defaultDoor.colorClass}
              textColorClass={defaultDoor.textColorClass}
            />
          );
        })}
      </div>
    </div>
  );
}
