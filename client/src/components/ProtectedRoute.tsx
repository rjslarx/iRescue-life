import { Route, RouteProps } from 'wouter';
import { RequirePageAccess } from './RequirePageAccess';

interface ProtectedRouteProps extends RouteProps {
  pageId: string;
  component: React.ComponentType<any>;
}

/**
 * Protected route wrapper that checks page permissions before rendering
 * Pages are responsible for their own layout (typically DashboardLayout)
 */
export function ProtectedRoute({ pageId, component: Component, ...routeProps }: ProtectedRouteProps) {
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
