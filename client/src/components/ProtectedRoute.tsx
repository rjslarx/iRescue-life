import { Route, RouteProps } from 'wouter';
import { RequirePageAccess } from './RequirePageAccess';

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
          <Component {...props} />
        </RequirePageAccess>
      )}
    />
  );
}
