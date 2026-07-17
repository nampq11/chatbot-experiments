"use client";

import { useChatStore, useSessions } from "@chatbot-experiments/client/chat";
import {
  AppLink,
  getChatRootPath,
  getChatSessionPath,
} from "@chatbot-experiments/client/navigation";
import { Button, cn, EmptyState, ErrorState } from "@chatbot-experiments/ui";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@chatbot-experiments/ui/components/ui/sidebar";
import {
  Bot,
  ChevronDown,
  Loader2,
  PanelLeftIcon,
  Search,
  SquarePen,
  Trash2,
} from "lucide-react";
import React, { useEffect, useMemo, useRef } from "react";
import { ChatSearchDialog } from "./chat-search-dialog";
import { DeleteAllSessionsDialog } from "./delete-all-sessions-dialog";

function ChatbotExperimentsLogo({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const iconSize = collapsed ? "size-[19px]" : "size-6";

  return (
    <AppLink
      to="/"
      aria-label="Go to home"
      title="Go to home"
      className={cn(
        "cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed
          ? "flex size-10 items-center justify-center rounded-lg hover:bg-sidebar-accent"
          : "flex h-9 min-w-0 items-center gap-2 rounded-lg px-2.5 hover:bg-sidebar-accent",
      )}
    >
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground",
          iconSize,
        )}
        aria-hidden="true"
      >
        <Bot className="size-[70%]" strokeWidth={2} />
      </span>

      {!collapsed && (
        <span className="truncate text-sm font-semibold text-sidebar-foreground">
          Chatbot Experiments
        </span>
      )}
    </AppLink>
  );
}

function CollapsedIconLink({
  label,
  to,
  children,
}: {
  label: string;
  to: string;
  children: React.ReactNode;
}) {
  return (
    <AppLink
      to={to}
      aria-label={label}
      title={label}
      className="inline-flex size-10 items-center justify-center rounded-xl text-sidebar-foreground/70 transition-[background-color,color,transform] duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 motion-reduce:transition-none"
    >
      {children}
    </AppLink>
  );
}

function CollapsedIconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-10 rounded-xl text-sidebar-foreground/70 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}

function ChatSidebarContent() {
  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useSessions();
  const { activeSessionId, openDeleteSessionDialog } = useChatStore();
  const { toggleSidebar } = useSidebar();
  const [isRecentsOpen, setIsRecentsOpen] = React.useState(true);
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = React.useState(false);
  const chatRootPath = getChatRootPath();

  const allSessions = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );
  const fetchNextSessionsPage = React.useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const hasSessions = allSessions.length > 0;

  // IntersectionObserver ref for sentinel element
  // fetchNextPage is stable (memoized by React Query), so we don't include it in deps
  const sentinelRef = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchNextPage is stable for the infinite query observer lifecycle.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) fetchNextPage();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage]);

  return (
    <Sidebar
      collapsible="icon"
      className="border-sidebar-border [--sidebar-width:260px] [--sidebar-width-icon:56px]"
    >
      {/* Expanded sidebar */}
      <div className="flex h-full w-full flex-col group-data-[collapsible=icon]:hidden">
        <SidebarHeader className="h-[52px] w-full px-3 py-0">
          <div className="flex h-full w-full items-center justify-between gap-2">
            <ChatbotExperimentsLogo />

            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-lg text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftIcon className="size-4" strokeWidth={1.8} />
            </Button>
          </div>
        </SidebarHeader>

        <SidebarContent className="w-full flex-1 px-3 pb-3 pt-2">
          {/* Toolbar */}
          <SidebarGroup className="w-full p-0">
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className="h-9 w-full justify-start rounded-lg px-2.5 text-sm font-normal leading-5 hover:bg-sidebar-accent"
                >
                  <AppLink to={chatRootPath}>
                    <SquarePen
                      className="size-[17px] shrink-0"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    <span>New chat</span>
                  </AppLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  className="h-9 w-full justify-start rounded-lg px-2.5 text-sm font-normal leading-5 hover:bg-sidebar-accent"
                  onClick={() => setIsSearchOpen(true)}
                  aria-haspopup="dialog"
                >
                  <Search
                    className="size-[17px] shrink-0"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span>Search chats</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* Loading skeleton */}
          {isLoading && (
            <SidebarGroup className="w-full p-0">
              <SidebarMenu>
                {Array.from({ length: 5 }).map((_, i) => (
                  <SidebarMenuSkeleton key={i} />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          )}

          {/* Data fetch error */}
          {isError && (
            <SidebarGroup className="w-full p-0">
              <ErrorState
                message={
                  <span className="flex flex-col items-center gap-2">
                    <span className="text-pretty">
                      Failed to load chats: {errorMessage}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetch()}
                    >
                      Try Again
                    </Button>
                  </span>
                }
              />
            </SidebarGroup>
          )}

          {/* Empty state */}
          {!isLoading && !isError && allSessions.length === 0 && (
            <SidebarGroup className="w-full p-0">
              <EmptyState
                description={
                  <>
                    No chats yet.{" "}
                    <AppLink
                      to={chatRootPath}
                      className="underline hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Start a new chat
                    </AppLink>
                  </>
                }
              />
            </SidebarGroup>
          )}

          {/* Recents toggle section */}
          {hasSessions && (
            <SidebarGroup className="mt-5 ml-[5px] w-full p-0">
              <div className="mb-1 flex h-8 w-full items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecentsOpen((prev) => !prev)}
                  className="
                    flex h-full min-w-0 flex-1 items-center gap-1 rounded-lg px-1
                    text-sm font-semibold leading-5 text-sidebar-foreground
                    hover:bg-sidebar-accent
                  "
                  aria-expanded={isRecentsOpen}
                >
                  <span>Recents</span>

                  <ChevronDown
                    className={cn(
                      "size-3.5 text-sidebar-foreground/60 transition-transform duration-150 motion-reduce:transition-none",
                      !isRecentsOpen && "-rotate-90",
                    )}
                    strokeWidth={2}
                  />
                </button>

                <Button
                  type="button"
                  variant="ghost"
                  className="h-6 w-12 shrink-0 rounded-md px-2 py-0 text-xs font-medium text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  onClick={() => setIsDeleteAllOpen(true)}
                  aria-label="Delete all chats"
                  title="Delete all chats"
                >
                  Clear
                </Button>
              </div>

              {isRecentsOpen && (
                <div className="space-y-0.5">
                  {allSessions.map((session) => {
                    const active = activeSessionId === session.id;

                    return (
                      <div
                        key={session.id}
                        className={cn(
                          "group relative flex h-9 w-full items-center rounded-lg [content-visibility:auto] [contain-intrinsic-size:36px]",
                          active
                            ? "bg-sidebar-accent"
                            : "hover:bg-sidebar-accent",
                        )}
                      >
                        <AppLink
                          to={getChatSessionPath(session.id)}
                          className={cn(
                            "mr-9 flex h-full min-w-0 flex-1 items-center rounded-lg px-1 text-left text-sm leading-5 text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            active ? "font-medium" : "font-normal",
                          )}
                        >
                          <span className="truncate">{session.title}</span>
                        </AppLink>

                        {active && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteSessionDialog(session.id);
                            }}
                            className="
                              absolute right-1 z-10 flex size-7 items-center justify-center rounded-md
                              text-sidebar-foreground/50 opacity-0 pointer-events-none [@media(pointer:coarse)]:opacity-100 [@media(pointer:coarse)]:pointer-events-auto
                              hover:bg-destructive/10 hover:text-destructive
                              [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover:pointer-events-auto
                              group-focus-within:opacity-100 group-focus-within:pointer-events-auto
                              focus-visible:opacity-100 focus-visible:pointer-events-auto
                              transition-[opacity,color,background-color] duration-150 ease-out motion-reduce:transition-none
                            "
                            aria-label="Delete chat"
                            title="Delete chat"
                          >
                            <Trash2
                              className="size-4"
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Sentinel for infinite scroll */}
                  {hasNextPage && (
                    <div ref={sentinelRef} className="flex justify-center py-2">
                      {isFetchingNextPage && (
                        <span
                          className="inline-flex items-center gap-2 text-xs text-sidebar-foreground/60"
                          role="status"
                        >
                          <Loader2
                            className="size-4 animate-spin text-sidebar-foreground/50 motion-reduce:animate-none"
                            aria-hidden="true"
                          />
                          Loading more…
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </SidebarGroup>
          )}
        </SidebarContent>
      </div>

      {/* Collapsed sidebar */}
      <div className="hidden h-full flex-col items-center group-data-[collapsible=icon]:flex">
        <div className="flex w-full flex-col items-center gap-1 pt-3">
          <ChatbotExperimentsLogo collapsed />

          <CollapsedIconButton label="Expand sidebar" onClick={toggleSidebar}>
            <PanelLeftIcon
              className="size-[19px]"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </CollapsedIconButton>

          <CollapsedIconLink label="New chat" to={chatRootPath}>
            <SquarePen
              className="size-[19px]"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </CollapsedIconLink>

          <CollapsedIconButton
            label="Search chats"
            onClick={() => setIsSearchOpen(true)}
          >
            <Search
              className="size-[19px]"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </CollapsedIconButton>
        </div>
      </div>

      <ChatSearchDialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        sessions={allSessions}
        isLoadingSessions={isLoading}
        hasNextSessionsPage={hasNextPage === true}
        isFetchingNextSessionsPage={isFetchingNextPage}
        hasSessionLoadError={isError || isFetchNextPageError}
        fetchNextSessionsPage={fetchNextSessionsPage}
      />
      <DeleteAllSessionsDialog
        open={isDeleteAllOpen}
        onOpenChange={setIsDeleteAllOpen}
      />
    </Sidebar>
  );
}

export function ChatSidebar() {
  return <ChatSidebarContent />;
}
