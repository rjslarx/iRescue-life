import { Route, RouteProps } from 'wouter';
import { RequirePageAccess } from './RequirePageAccess';
import { ProFeatureGate } from './ProFeatureGate';

interface ProtectedRouteProps extends RouteProps {
  pageId: string;
  component: React.ComponentType<any>;
  proOnly?: boolean;
  proFeatureName?: string;
}

export function ProtectedRoute({ pageId, component: Component, proOnly, proFeatureName, ...routeProps }: ProtectedRouteProps) {
  return (
    <Route
      {...routeProps}
      component={(props: any) => (
        <RequirePageAccess pageId={pageId}>
          {proOnly ? (
            <ProFeatureGate featureName={proFeatureName}>
              <Component {...props} />
            </ProFeatureGate>
          ) : (
            <Component {...props} />
          )}
        </RequirePageAccess>
      )}
    />
  );
}
