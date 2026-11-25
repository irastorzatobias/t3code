import { resolveThreadCurrentPullRequestLink } from "@t3tools/client-runtime/thread-pull-requests";

import type { SidebarThreadSummary } from "../../types";
import { hasUnseenCompletion, resolveSidebarRowStatus } from "../Sidebar.logic";

const ISSUE_KEY_PATTERN = /(?:^|[^A-Za-z0-9])([A-Za-z][A-Za-z0-9]+-\d+)(?![0-9])/;

/**
 * The Jira task a thread's branch names (`fix/PCX-123-slug`), on the configured site.
 * Null without a site, a valid http(s) site, or a key in the branch.
 */
export function jiraIssueFromBranch(
  branch: string | null | undefined,
  siteUrl: string,
): { readonly key: string; readonly url: string } | null {
  const site = siteUrl.trim().replace(/\/+$/, "");
  if (!branch || !/^https?:\/\/[^/\s]+/.test(site)) return null;
  const match = ISSUE_KEY_PATTERN.exec(branch);
  if (!match?.[1]) return null;
  const key = match[1].toUpperCase();
  return { key, url: `${site}/browse/${key}` };
}

export const THREADS_PANEL_FILTERS = ["all", "attention", "failing", "unread", "working"] as const;
export type ThreadsPanelFilter = (typeof THREADS_PANEL_FILTERS)[number];

type ThreadsPanelThread = Parameters<typeof resolveSidebarRowStatus>[0] &
  Pick<SidebarThreadSummary, "pullRequests">;

function pullRequestIsFailing(thread: Pick<SidebarThreadSummary, "pullRequests">): boolean {
  const snapshot = resolveThreadCurrentPullRequestLink(thread.pullRequests)?.snapshot;
  if (!snapshot || snapshot.state !== "open") return false;
  return snapshot.checksState === "failing" || snapshot.mergeability === "conflicting";
}

export function threadMatchesPanelFilter(
  thread: ThreadsPanelThread,
  filter: ThreadsPanelFilter,
): boolean {
  if (filter === "all") return true;
  const status = resolveSidebarRowStatus(thread);
  switch (filter) {
    case "attention":
      return (
        status === "approval" || status === "input" || status === "request" || status === "limited"
      );
    case "failing":
      return status === "failed" || pullRequestIsFailing(thread);
    case "unread":
      return status === "ready" && hasUnseenCompletion(thread);
    case "working":
      return status === "working" || status === "preparing";
  }
}

export function countThreadsByPanelFilter(
  threads: ReadonlyArray<ThreadsPanelThread>,
): Record<ThreadsPanelFilter, number> {
  const counts = { all: 0, attention: 0, failing: 0, unread: 0, working: 0 };
  for (const thread of threads) {
    for (const filter of THREADS_PANEL_FILTERS) {
      if (threadMatchesPanelFilter(thread, filter)) counts[filter] += 1;
    }
  }
  return counts;
}
