import { Component, type ReactNode } from "react";

// A tab left open across a release may reference a chunk that no longer exists.
// Offer an explicit reload instead of a blank page or an automatic reload loop.
export class RouteLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="p-8 text-center space-y-4">
          <p>This page could not load. Check your connection, then reload to try again.</p>
          <button className="underline" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      );
    }
    return this.props.children;
  }
}
