export interface RouteState {
  view: 'dashboard' | 'trip';
  slug?: string;
}

export type RouteChangeCallback = (state: RouteState) => void;

class Router {
  private callbacks: RouteChangeCallback[] = [];
  private lastRoute: RouteState = { view: 'dashboard' };

  constructor() {
    window.addEventListener('hashchange', () => this.handleHashChange());
    window.addEventListener('popstate', () => this.handleHashChange());
  }

  public subscribe(cb: RouteChangeCallback) {
    this.callbacks.push(cb);
  }

  public getCurrentRoute(): RouteState {
    const rawHash = window.location.hash.replace(/^#\/?/, '').trim();
    const rawPath = window.location.pathname.replace(/^\//, '').trim();

    // Ignore in-page section anchor hashes (e.g. #section-packing)
    if (rawHash.startsWith('section-')) {
      return this.lastRoute;
    }

    // Check hash first (e.g. #/trips/thailand-2027 or #/thailand-2027)
    let routeStr = rawHash;
    if (!routeStr && rawPath) {
      routeStr = rawPath;
    }

    if (!routeStr || routeStr === 'dashboard' || routeStr === '') {
      this.lastRoute = { view: 'dashboard' };
      return this.lastRoute;
    }

    // Match trips/:slug or /:slug
    const tripMatch = routeStr.match(/^(?:trips\/)?([a-zA-Z0-9_-]+)$/);
    if (tripMatch && tripMatch[1] && tripMatch[1] !== 'dashboard') {
      this.lastRoute = { view: 'trip', slug: tripMatch[1] };
      return this.lastRoute;
    }

    this.lastRoute = { view: 'dashboard' };
    return this.lastRoute;
  }

  public navigateToDashboard() {
    window.location.hash = '#/';
  }

  public navigateToTrip(slug: string) {
    window.location.hash = `#/trips/${slug}`;
  }

  private handleHashChange() {
    const state = this.getCurrentRoute();
    this.callbacks.forEach(cb => cb(state));
  }
}

export const router = new Router();
