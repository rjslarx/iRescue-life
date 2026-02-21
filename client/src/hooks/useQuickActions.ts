import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ALL_QUICK_ACTIONS, DEFAULT_QUICK_ACTIONS, getQuickActionsByIds, type QuickAction } from "@/lib/quick-actions";

interface QuickActionsResponse {
  quickActions: string[];
}

interface UseQuickActionsCallbacks {
  onRecordDonation?: () => void;
}

export function useQuickActions(callbacks?: UseQuickActionsCallbacks) {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<QuickActionsResponse>({
    queryKey: ['/api/tenant/settings/quick-actions'],
    staleTime: 5 * 60 * 1000,
  });

  // Use default actions if no configuration or empty array
  const configuredActionIds = data?.quickActions?.length ? data.quickActions : DEFAULT_QUICK_ACTIONS;
  const actions = getQuickActionsByIds(configuredActionIds);

  const handleAction = (actionId: string) => {
    const action = ALL_QUICK_ACTIONS.find((a) => a.id === actionId);
    if (!action) return;

    if (action.actionType === 'callback' && action.callbackName === 'onRecordDonation') {
      callbacks?.onRecordDonation?.();
    } else if (action.href) {
      navigate(action.href);
    }
  };

  return {
    actions,
    handleAction,
    isLoading,
    configuredActionIds,
  };
}
