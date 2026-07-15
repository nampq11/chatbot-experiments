/** Cursor-paginated result returned by list use cases and repositories. */
export interface PaginatedResult<T> {
  readonly items: ReadonlyArray<T>;
  readonly nextCursor: string | null;
}
