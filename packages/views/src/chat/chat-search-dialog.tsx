"use client";

import type { Session } from "@chatbot-experiments/client/chat";
import {
  AppLink,
  getChatRootPath,
  getChatSessionPath,
} from "@chatbot-experiments/client/navigation";
import { cn } from "@chatbot-experiments/ui";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@chatbot-experiments/ui/components/ui/dialog";
import { MessageSquare, Search, SquarePen, X } from "lucide-react";
import * as React from "react";

type ChatSearchGroup = {
  label: string;
  sessions: Session[];
};

type ChatSearchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: Session[];
  isLoadingSessions: boolean;
  hasNextSessionsPage: boolean;
  isFetchingNextSessionsPage: boolean;
  hasSessionLoadError: boolean;
  fetchNextSessionsPage: () => void;
};

type SearchCoverageStatusProps = {
  isCompletingSearchCoverage: boolean;
  hasSessionLoadError: boolean;
  hasSearchQuery: boolean;
};

type EmptySearchResultsProps = SearchCoverageStatusProps & {
  isWaitingForInitialSessions: boolean;
};

function SearchCoverageStatus({
  isCompletingSearchCoverage,
  hasSessionLoadError,
  hasSearchQuery,
}: SearchCoverageStatusProps) {
  if (isCompletingSearchCoverage) {
    return (
      <div
        className="px-4 py-3 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        Loading more chats…
      </div>
    );
  }

  if (hasSessionLoadError && hasSearchQuery) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground">
        Unable to load more chats to complete the search.
      </div>
    );
  }

  return null;
}

function EmptySearchResults({
  isCompletingSearchCoverage,
  isWaitingForInitialSessions,
  hasSessionLoadError,
  hasSearchQuery,
}: EmptySearchResultsProps) {
  if (isCompletingSearchCoverage || isWaitingForInitialSessions) {
    return (
      <div
        className="flex h-32 items-center justify-center px-6 text-center text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        Loading more chats…
      </div>
    );
  }

  if (hasSessionLoadError && hasSearchQuery) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-1.5 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Unable to load more chats to complete the search.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-32 flex-col items-center justify-center gap-1.5 px-6 text-center">
      <Search
        className="size-8 text-muted-foreground/40"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p className="text-sm text-muted-foreground">No chats found.</p>
    </div>
  );
}

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getSessionTime(session: Session) {
  return session.updatedAt.getTime() || session.createdAt.getTime();
}

/** Groups loaded chat sessions into the date buckets used by the search dialog. */
function groupSessionsByAge(sessions: Session[]): ChatSearchGroup[] {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const today: Session[] = [];
  const previousThirtyDays: Session[] = [];
  const older: Session[] = [];

  sessions.forEach((session) => {
    const sessionDate = new Date(getSessionTime(session));

    if (isSameCalendarDay(sessionDate, now)) {
      today.push(session);
      return;
    }

    if (sessionDate >= thirtyDaysAgo) {
      previousThirtyDays.push(session);
      return;
    }

    older.push(session);
  });

  return [
    { label: "Today", sessions: today },
    { label: "Previous 30 days", sessions: previousThirtyDays },
    { label: "Older", sessions: older },
  ].filter((group) => group.sessions.length > 0);
}

/** Search dialog for quickly starting or reopening chat sessions. */
export function ChatSearchDialog({
  open,
  onOpenChange,
  sessions,
  isLoadingSessions,
  hasNextSessionsPage,
  isFetchingNextSessionsPage,
  hasSessionLoadError,
  fetchNextSessionsPage,
}: ChatSearchDialogProps) {
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listboxId = React.useId();
  const chatRootPath = getChatRootPath();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const hasSearchQuery = normalizedQuery.length > 0;
  const isWaitingForInitialSessions =
    isLoadingSessions && sessions.length === 0;
  const shouldCompleteSearchCoverage =
    open &&
    hasSearchQuery &&
    !isLoadingSessions &&
    hasNextSessionsPage &&
    !isFetchingNextSessionsPage &&
    !hasSessionLoadError;
  const isCompletingSearchCoverage =
    hasSearchQuery &&
    (isLoadingSessions || (hasNextSessionsPage && !hasSessionLoadError));

  const filteredSessions = React.useMemo(() => {
    const sortedSessions = [...sessions].sort(
      (a, b) => getSessionTime(b) - getSessionTime(a),
    );

    if (!normalizedQuery) {
      return sortedSessions;
    }

    return sortedSessions.filter((session) =>
      session.title.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, sessions]);

  const groupedSessions = React.useMemo(
    () => groupSessionsByAge(filteredSessions),
    [filteredSessions],
  );

  // Flat list of all items for keyboard navigation (new-chat + sessions)
  const flatItems = React.useMemo(() => {
    const items: Array<
      { type: "new-chat" } | { type: "session"; session: Session }
    > = [{ type: "new-chat" }];
    groupedSessions.forEach((group) => {
      group.sessions.forEach((session) => {
        items.push({ type: "session", session });
      });
    });
    return items;
  }, [groupedSessions]);

  const getOptionId = React.useCallback(
    (index: number) => `${listboxId}-option-${index}`,
    [listboxId],
  );
  const activeDescendant =
    activeIndex >= 0 ? getOptionId(activeIndex) : undefined;

  React.useEffect(() => {
    if (shouldCompleteSearchCoverage) {
      fetchNextSessionsPage();
    }
  }, [fetchNextSessionsPage, shouldCompleteSearchCoverage]);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(-1);
      return;
    }

    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);

    return () => window.clearTimeout(focusTimer);
  }, [open]);

  // Reset active index when query changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: normalizedQuery is used only to trigger the reset when the search term changes.
  React.useEffect(() => {
    setActiveIndex(-1);
  }, [normalizedQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const item = flatItems[activeIndex];
      if (item) {
        onOpenChange(false);
        // Navigation will be handled by the link click
        const activeEl = listRef.current?.querySelector(
          `[data-search-index="${activeIndex}"]`,
        ) as HTMLAnchorElement | null;
        activeEl?.click();
      }
    }
  };

  // Scroll active item into view
  React.useEffect(() => {
    if (activeIndex < 0) return;
    const activeEl = listRef.current?.querySelector(
      `[data-search-index="${activeIndex}"]`,
    );
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  let itemIndex = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          top-[15%] flex h-[min(70dvh,552px)] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)]
          max-w-[700px] -translate-y-0 flex-col overflow-hidden rounded-2xl border border-border/60
          bg-popover p-0 text-popover-foreground shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]
          backdrop-blur-sm
        "
      >
        <DialogTitle className="sr-only">Search chats</DialogTitle>

        {/* Search header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-5">
          <Search
            className="size-[18px] shrink-0 text-muted-foreground"
            strokeWidth={2}
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            className="
              h-14 min-w-0 flex-1 bg-transparent text-base text-popover-foreground outline-none
              placeholder:text-muted-foreground
            "
            placeholder="Search chats…"
            aria-label="Search chats"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-haspopup="listbox"
            aria-activedescendant={activeDescendant}
            autoComplete="off"
          />

          <DialogClose
            className="
              ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg
              text-muted-foreground transition-colors duration-150
              hover:bg-accent hover:text-accent-foreground
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
            "
            aria-label="Close search"
          >
            <X className="size-4" strokeWidth={2} aria-hidden="true" />
          </DialogClose>
        </div>

        {/* Results */}
        <div
          id={listboxId}
          ref={listRef}
          role="listbox"
          aria-label="Chat search results"
          aria-busy={isCompletingSearchCoverage || undefined}
          className="sidebar-scrollbar min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5"
        >
          {/* New chat button */}
          <DialogClose asChild>
            <AppLink
              to={chatRootPath}
              id={getOptionId(0)}
              data-search-index={0}
              role="option"
              aria-selected={activeIndex === 0}
              className={cn(
                "flex h-11 w-full items-center gap-3 rounded-xl px-4 text-sm font-medium",
                "text-popover-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeIndex === 0
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/60",
              )}
            >
              <SquarePen
                className="size-[18px] shrink-0 opacity-70"
                strokeWidth={1.8}
                aria-hidden="true"
              />
              <span className="truncate">New chat</span>
            </AppLink>
          </DialogClose>

          {groupedSessions.length > 0 ? (
            <div className="pb-2">
              {groupedSessions.map((group) => {
                return (
                  <section key={group.label} className="mt-3 first:mt-2">
                    <h3 className="px-4 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">
                      {group.label}
                    </h3>

                    <div className="space-y-0.5">
                      {group.sessions.map((session) => {
                        // itemIndex 0 = "New chat", so sessions start at 1
                        const currentIndex = ++itemIndex;
                        const isActive = activeIndex === currentIndex;

                        return (
                          <DialogClose key={session.id} asChild>
                            <AppLink
                              to={getChatSessionPath(session.id)}
                              id={getOptionId(currentIndex)}
                              data-search-index={currentIndex}
                              role="option"
                              aria-selected={isActive}
                              className={cn(
                                "flex h-10 w-full items-center gap-3 rounded-xl px-4 text-sm",
                                "text-popover-foreground",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                isActive
                                  ? "bg-accent text-accent-foreground"
                                  : "hover:bg-accent/60",
                              )}
                            >
                              <MessageSquare
                                className="size-[18px] shrink-0 opacity-50"
                                strokeWidth={1.8}
                                aria-hidden="true"
                              />
                              <span className="truncate">{session.title}</span>
                            </AppLink>
                          </DialogClose>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              <SearchCoverageStatus
                isCompletingSearchCoverage={isCompletingSearchCoverage}
                hasSessionLoadError={hasSessionLoadError}
                hasSearchQuery={hasSearchQuery}
              />
            </div>
          ) : (
            <EmptySearchResults
              isCompletingSearchCoverage={isCompletingSearchCoverage}
              isWaitingForInitialSessions={isWaitingForInitialSessions}
              hasSessionLoadError={hasSessionLoadError}
              hasSearchQuery={hasSearchQuery}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
