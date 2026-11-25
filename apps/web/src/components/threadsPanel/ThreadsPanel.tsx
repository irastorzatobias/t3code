import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { isShownUnderParent } from "@t3tools/client-runtime/state/threads";
import { effectiveSnoozed } from "@t3tools/client-runtime/state/thread-settled";
import { threadSearchMatchKey } from "@t3tools/client-runtime/state/thread-search";
import { resolveThreadCurrentPullRequestLink } from "@t3tools/client-runtime/thread-pull-requests";
import { sortThreads } from "@t3tools/client-runtime/state/thread-sort";
import type { EnvironmentId } from "@t3tools/contracts";
import { LegendList } from "@legendapp/list/react";
import { useNavigate } from "@tanstack/react-router";
import { msg, T, useGT, useMessages } from "gt-react";
import { SearchIcon } from "lucide-react";
import { useState } from "react";

import { RelativeTime } from "~/components/RelativeTime";
import { useClientSettings } from "~/hooks/useSettings";
import { useRightPanelStore } from "~/rightPanelStore";
import { cn } from "~/lib/utils";
import { useDelegatedUnderParent, useVisibleThreadShells } from "~/state/entities";
import { useEnvironments } from "~/state/environments";
import { useThreadSearch } from "~/state/queries";
import { buildThreadRouteParams } from "~/threadRoutes";
import type { SidebarThreadSummary } from "~/types";
import { useProjectLookups } from "../CommandPaletteLookups";
import { pullRequestChecksStatePresentation } from "../pullRequest/pullRequestPresentation";
import { searchSidebarThreads } from "../Sidebar.logic";
import { ThreadRowLeadingStatus } from "../ThreadStatusIndicators";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import {
  countThreadsByPanelFilter,
  THREADS_PANEL_FILTERS,
  threadMatchesPanelFilter,
  type ThreadsPanelFilter,
} from "./threadsPanel.logic";

const FILTER_LABELS: Record<ThreadsPanelFilter, string> = {
  all: msg("All", { $context: "threads filter" }),
  attention: msg("Needs you", { $context: "threads filter" }),
  failing: msg("Failing", { $context: "threads filter" }),
  unread: msg("Unread", { $context: "threads filter" }),
  working: msg("Working", { $context: "threads filter" }),
};

function ThreadPullRequestCell({ thread }: { thread: SidebarThreadSummary }) {
  const resolve = useMessages();
  const link = resolveThreadCurrentPullRequestLink(thread.pullRequests);
  if (link === null) return null;
  const checksState = link.snapshot?.checksState ?? null;
  const checks =
    checksState === null ? null : pullRequestChecksStatePresentation(checksState, resolve);
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
      {checks ? (
        <checks.Icon
          role="img"
          aria-label={checks.label}
          className={cn("size-3.5", checks.toneClassName)}
        />
      ) : null}
      #{link.number}
    </span>
  );
}

function ThreadsPanelRow({
  thread,
  projectTitle,
  onOpen,
}: {
  thread: SidebarThreadSummary;
  projectTitle: string | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent/60"
    >
      <ThreadRowLeadingStatus thread={thread} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{thread.title}</span>
        {projectTitle ? (
          <span className="truncate text-xs text-muted-foreground">{projectTitle}</span>
        ) : null}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <ThreadPullRequestCell thread={thread} />
        <span className="text-2xs text-muted-foreground">
          <RelativeTime timestamp={thread.updatedAt} />
        </span>
      </span>
    </button>
  );
}

/** Every thread across projects, searchable and filtered by what it needs from the user. */
export function ThreadsPanel() {
  const gt = useGT();
  const resolve = useMessages();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ThreadsPanelFilter>("all");
  const shells = useVisibleThreadShells();
  const delegatedUnderParent = useDelegatedUnderParent();
  const sortOrder = useClientSettings((settings) => settings.sidebarThreadSortOrder);
  const { projectByKey } = useProjectLookups();
  const { environments } = useEnvironments();
  const connectedEnvironmentIds: ReadonlyArray<EnvironmentId> = environments
    .filter((environment) => environment.connection.phase === "connected")
    .map((environment) => environment.environmentId);
  const messageSearch = useThreadSearch(connectedEnvironmentIds, query);

  const searching = query.trim().length > 0;
  // oxlint-disable-next-line react/purity -- snooze expiry is sampled per render, as the palette does
  const now = new Date().toISOString();
  const listed = shells.filter(
    (thread) =>
      thread.archivedAt === null &&
      !isShownUnderParent(
        scopeThreadRef(thread.environmentId, thread.id),
        thread.lineage,
        delegatedUnderParent,
      ) &&
      // Settled and snoozed threads stay out of the way until a search asks for them.
      (searching || (thread.settledOverride !== "settled" && !effectiveSnoozed(thread, { now }))),
  );
  const searched = searching
    ? (() => {
        const { titleMatches, contentMatches } = searchSidebarThreads(
          listed,
          query,
          new Set(messageSearch.matches.map(threadSearchMatchKey)),
        );
        return [...titleMatches, ...contentMatches];
      })()
    : sortThreads(listed, sortOrder);
  const counts = countThreadsByPanelFilter(searched);
  const visible = searched.filter((thread) => threadMatchesPanelFilter(thread, filter));

  const openThread = (thread: SidebarThreadSummary) => {
    const threadRef = scopeThreadRef(thread.environmentId, thread.id);
    // Panels are per thread; the list follows into the thread it opened, so it stays at hand.
    useRightPanelStore.getState().open(threadRef, "threads");
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(threadRef) });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-border/60 p-2">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon aria-hidden className="size-3" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            size="sm"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || query.length === 0) return;
              event.preventDefault();
              setQuery("");
            }}
            placeholder={gt("Search threads")}
            aria-label={gt("Search threads")}
          />
        </InputGroup>
        <ToggleGroup
          aria-label={gt("Filter threads")}
          className="w-full *:flex-1"
          value={[filter]}
          onValueChange={(next) => {
            const value = next[0];
            if (value !== undefined) setFilter(value as ThreadsPanelFilter);
          }}
        >
          {THREADS_PANEL_FILTERS.map((value) => (
            <Toggle key={value} value={value}>
              {resolve(FILTER_LABELS[value])}
              <span className="text-muted-foreground tabular-nums">{counts[value]}</span>
            </Toggle>
          ))}
        </ToggleGroup>
      </div>
      {visible.length === 0 ? (
        <p role="status" className="p-6 text-center text-xs text-muted-foreground">
          {searching && messageSearch.isPending ? (
            <T>Searching thread messages…</T>
          ) : (
            <T>No threads here</T>
          )}
        </p>
      ) : (
        <LegendList<SidebarThreadSummary>
          data={visible}
          keyExtractor={(thread) => `${thread.environmentId}:${thread.id}`}
          extraData={projectByKey}
          renderItem={({ item: thread }) => (
            <ThreadsPanelRow
              thread={thread}
              projectTitle={
                projectByKey.get(`${thread.environmentId}:${thread.projectId}`)?.title ?? null
              }
              onOpen={() => openThread(thread)}
            />
          )}
          estimatedItemSize={48}
          drawDistance={480}
          className="min-h-0 flex-1 overscroll-contain p-1.5"
        />
      )}
    </div>
  );
}
