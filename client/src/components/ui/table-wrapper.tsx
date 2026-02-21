import { cn } from "@/lib/utils";

interface TableWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export function TableWrapper({ children, className }: TableWrapperProps) {
  return (
    <div 
      className={cn("w-full overflow-x-auto -mx-1 px-1", className)}
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div className="min-w-[500px]">
        {children}
      </div>
    </div>
  );
}
