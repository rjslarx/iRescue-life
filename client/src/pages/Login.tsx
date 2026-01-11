import { useQuery } from "@tanstack/react-query";
import LoginForm from "@/components/LoginForm";
import type { Tenant } from "@shared/schema";

export default function Login() {
  const { data: tenantData } = useQuery<{ tenant: Tenant }>({
    queryKey: ['/api/tenant'],
  });

  const tenant = tenantData?.tenant;

  return <LoginForm rescueName={tenant?.name || "Your Rescue"} />;
}
