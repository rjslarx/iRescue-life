import { useEffect } from "react";
import { useLocation } from "wouter";

export default function SettingsPage() {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate("/dashboard/settings/branding", { replace: true });
  }, [navigate]);

  return null;
}
