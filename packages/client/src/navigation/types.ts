/**
 * Platform abstraction for navigation.
 * Inject an implementation via <NavigationProvider adapter={...}>.
 * Apps provide framework-specific router adapters.
 */
export interface NavigationAdapter {
  push(path: string): void;
  replace(path: string): void;
  back(): void;
  /**
   * Resolve a path for href attributes in <a> tags.
   * For most frameworks this is an identity function.
   */
  resolveHref(path: string): string;
}
