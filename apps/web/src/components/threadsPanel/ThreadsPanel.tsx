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
import { useOpenLink } from "~/browser/useOpenLink";
import { useOpenPrLink } from "~/lib/openPullRequestLink";
import { useRightPanelStore } from "~/rightPanelStore";
import { cn } from "~/lib/utils";
import { useDelegatedUnderParent, useVisibleThreadShells } from "~/state/entities";
import { useEnvironments } from "~/state/environments";
import { useThreadSearch } from "~/state/queries";
import { buildThreadRouteParams } from "~/threadRoutes";
import type { SidebarThreadSummary } from "~/types";
import { useProjectLookups } from "../CommandPaletteLookups";
import { pullRequestChecksStatePresentation } from "../pullRequest/pullRequestPresentation";
import { resolveThreadStatusPill, searchSidebarThreads } from "../Sidebar.logic";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
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

const LINK_CLASS =
  "pointer-events-auto relative z-10 inline-flex shrink-0 items-center gap-1 rounded-sm text-xs text-muted-foreground tabular-nums hover:text-foreground hover:underline";

function ThreadPullRequestLink({ thread }: { thread: SidebarThreadSummary }) {
  const resolve = useMessages();
  const threadRef = scopeThreadRef(thread.environmentId, thread.id);
  const openPrLink = useOpenPrLink(threadRef);
  const link = resolveThreadCurrentPullRequestLink(thread.pullRequests);
  if (link === null) return null;
  const checksState = link.snapshot?.checksState ?? null;
  const checks =
    checksState === null ? null : pullRequestChecksStatePresentation(checksState, resolve);
  return (
    <a
      href={link.url}
      onClick={(event) => openPrLink(event, link.url, threadRef)}
      className={LINK_CLASS}
    >
      {checks ? (
        <checks.Icon
          role="img"
          aria-label={checks.label}
          className={cn("size-3.5", checks.toneClassName)}
        />
      ) : null}
      #{link.number}
    </a>
  );
}

function ThreadIssueLink({ thread }: { thread: SidebarThreadSummary }) {
  const threadRef = scopeThreadRef(thread.environmentId, thread.id);
  const openLink = useOpenLink(threadRef);
  const issue = thread.issues?.[0];
  if (issue === undefined) return null;
  return (
    <a
      href={issue.url}
      onClick={(event) => {
        if (event.button > 1) return;
        event.preventDefault();
        void openLink(issue.url, { event, threadRef });
      }}
      className={LINK_CLASS}
    >
      {issue.displayKey}
    </a>
  );
}

function ThreadStatusDot({ thread }: { thread: SidebarThreadSummary }) {
  const resolve = useMessages();
  const pill = resolveThreadStatusPill({ thread });
  if (pill === null) return <span aria-hidden className="size-1.5 shrink-0" />;
  const label = resolve(pill.label);
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("size-1.5 shrink-0 rounded-full", pill.dotClass)}
    />
  );
}

function ThreadsPanelRow({
  thread,
  projectTitle,
  striped,
  onOpen,
}: {
  thread: SidebarThreadSummary;
  projectTitle: string | null;
  striped: boolean;
  onOpen: () => void;
}) {
  // The open button stretches under the row, so its links stay separate targets.
  return (
    <div
      className={cn(
        "relative flex h-8 min-w-0 items-center gap-2.5 rounded-md px-2.5 text-sm",
        striped && "bg-muted/30",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={thread.title}
        className="absolute inset-0 rounded-md outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      />
      <span className="pointer-events-none relative flex min-w-0 flex-1 items-center gap-2.5">
        <ThreadStatusDot thread={thread} />
        <span className="min-w-0 flex-1 truncate">{thread.title}</span>
        {projectTitle ? (
          <span className="max-w-[35%] shrink truncate text-xs text-muted-foreground">
            {projectTitle}
          </span>
        ) : null}
      </span>
      <ThreadIssueLink thread={thread} />
      <span className="flex w-16 shrink-0 justify-end">
        <ThreadPullRequestLink thread={thread} />
      </span>
      <span className="pointer-events-none relative w-14 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        <RelativeTime timestamp={thread.updatedAt} />
      </span>
    </div>
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
        <div role="group" aria-label={gt("Filter threads")} className="flex flex-wrap gap-1">
          {THREADS_PANEL_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs",
                filter === value
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {resolve(FILTER_LABELS[value])}
              <span className="tabular-nums opacity-60">{counts[value]}</span>
            </button>
          ))}
        </div>
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
          renderItem={({ item: thread, index }) => (
            <ThreadsPanelRow
              thread={thread}
              striped={index % 2 === 1}
              projectTitle={
                projectByKey.get(`${thread.environmentId}:${thread.projectId}`)?.title ?? null
              }
              onOpen={() => openThread(thread)}
            />
          )}
          estimatedItemSize={32}
          drawDistance={320}
          className="min-h-0 flex-1 overscroll-contain p-1.5"
        />
      )}
    </div>
  );
}
