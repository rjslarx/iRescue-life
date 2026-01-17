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
          <p className="text-muted-foreground text-sm mb-3">{description}</p>
          <span className="inline-block bg-primary text-primary-foreground font-semibold text-sm px-4 py-1.5 rounded-full shadow-sm group-hover:shadow-md transition-shadow">
            {linkText}
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

// Helper to check if a URL is external or a special protocol
function isExternalOrSpecialUrl(url: string): boolean {
  return (
    url.startsWith('http://') || 
    url.startsWith('https://') ||
    url.startsWith('//') ||
    url.startsWith('mailto:') ||
    url.startsWith('tel:') ||
    url.startsWith('sms:') ||
    url.startsWith('ftp:') ||
    url.startsWith('#')
  );
}

// Helper to build tenant-aware URLs without duplication
function buildTenantUrl(basePath: string, linkUrl: string): string {
  // Handle empty/undefined inputs
  if (!linkUrl || linkUrl.trim() === '') {
    linkUrl = '/';
  }
  
  // Normalize basePath: ensure it starts with / if not empty, or is empty string
  const normalizedBasePath = basePath?.trim()
    ? (basePath.startsWith('/') ? basePath : '/' + basePath) 
    : '';
  
  // Normalize link URL: ensure it starts with /
  let normalizedUrl = linkUrl.trim();
  if (!normalizedUrl.startsWith('/')) {
    normalizedUrl = '/' + normalizedUrl;
  }
  
  // Remove any existing duplicate basePath from the start of the URL
  // This handles cases where linkUrl is already "/haseyas/volunteer" and basePath is "/haseyas"
  const basePathWithoutSlash = normalizedBasePath.slice(1); // "haseyas"
  if (basePathWithoutSlash && normalizedUrl.startsWith('/' + basePathWithoutSlash + '/')) {
    // URL already contains basePath, return as-is
    return normalizedUrl;
  }
  
  // If basePath is empty, just return the normalized URL
  if (!normalizedBasePath) {
    return normalizedUrl;
  }
  
  // Check if URL already includes the basePath exactly - don't duplicate
  if (normalizedUrl.startsWith(normalizedBasePath + '/') || normalizedUrl === normalizedBasePath) {
    return normalizedUrl;
  }
  
  // Prepend basePath
  return `${normalizedBasePath}${normalizedUrl}`;
}

export default function ThreeDoors({ basePath = '', config }: ThreeDoorsProps) {
  const doorConfigs = [config?.door1, config?.door2, config?.door3];

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto px-4">
        {DEFAULT_DOORS.map((defaultDoor, index) => {
          const customConfig = doorConfigs[index];
          const title = customConfig?.title || defaultDoor.config.title;
          const description = customConfig?.description || defaultDoor.config.description;
          const linkText = customConfig?.linkText || defaultDoor.config.linkText;
          const customLinkUrl = typeof customConfig?.linkUrl === 'string' ? customConfig.linkUrl.trim() : null;
          
          // Determine the link URL - DO NOT prepend basePath because wouter's Router 
          // is configured with base={basePath} and will handle the prefix automatically
          let linkUrl: string;
          if (customLinkUrl) {
            // External or special URLs are passed through unchanged
            if (isExternalOrSpecialUrl(customLinkUrl)) {
              linkUrl = customLinkUrl;
            } else {
              // Strip any existing basePath prefix from custom URL to avoid duplication
              let cleanUrl = customLinkUrl;
              if (basePath && cleanUrl.startsWith(basePath + '/')) {
                cleanUrl = cleanUrl.slice(basePath.length);
              } else if (basePath && cleanUrl.startsWith(basePath.slice(1) + '/')) {
                // Handle case where basePath is "/haseyas" but URL is "haseyas/volunteer"
                cleanUrl = '/' + cleanUrl.slice(basePath.slice(1).length + 1);
              }
              // Ensure it starts with /
              linkUrl = cleanUrl.startsWith('/') ? cleanUrl : '/' + cleanUrl;
            }
          } else {
            // Use the default URL as-is (like /animals, /foster, /volunteer)
            linkUrl = defaultDoor.config.linkUrl;
          }
          
          // Ensure URL starts with / for wouter to treat as absolute path within the base
          const finalLinkUrl = linkUrl.startsWith('/') ? linkUrl : '/' + linkUrl;
          
          const iconType = customConfig?.icon || defaultDoor.config.icon;
          const IconComponent = ICONS[iconType];

          return (
            <Door
              key={index}
              icon={<IconComponent className="h-5 w-5" />}
              title={title}
              description={description}
              linkText={linkText}
              linkUrl={finalLinkUrl}
              colorClass={defaultDoor.colorClass}
              textColorClass={defaultDoor.textColorClass}
            />
          );
        })}
      </div>
    </div>
  );
}
