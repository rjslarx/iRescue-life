import { Link } from "wouter";
import { ChevronRight, Home } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  showHome?: boolean;
}

export default function Breadcrumbs({ items, showHome = true }: BreadcrumbsProps) {
  const { basePath } = useTenant();
  return (
    <nav 
      className="flex items-center gap-2 text-sm text-muted-foreground"
      aria-label="Breadcrumb"
      data-testid="breadcrumbs"
    >
      {showHome && (
        <>
          <Link href={`${basePath}/dashboard`}>
            <a 
              className="flex items-center gap-1 hover:text-foreground transition-colors"
              data-testid="breadcrumb-home"
            >
              <Home className="h-4 w-4" />
            </a>
          </Link>
          {items.length > 0 && <ChevronRight className="h-4 w-4" />}
        </>
      )}
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={index} className="flex items-center gap-2">
            {item.href && !isLast ? (
              <Link href={item.href}>
                <a 
                  className="hover:text-foreground transition-colors"
                  data-testid={`breadcrumb-link-${index}`}
                >
                  {item.label}
                </a>
              </Link>
            ) : (
              <span 
                className={isLast ? "text-foreground font-medium" : ""}
                data-testid={`breadcrumb-item-${index}`}
              >
                {item.label}
              </span>
            )}
            {!isLast && <ChevronRight className="h-4 w-4" />}
          </div>
        );
      })}
    </nav>
  );
}
