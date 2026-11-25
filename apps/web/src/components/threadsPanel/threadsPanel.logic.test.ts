import type { ThreadPullRequestLink } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { countThreadsByPanelFilter, threadMatchesPanelFilter } from "./threadsPanel.logic";

const idle = {
  hasActionableProposedPlan: false,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  interactionMode: "default" as const,
  runtime: null,
  latestRun: null,
  pullRequests: [] as ReadonlyArray<ThreadPullRequestLink>,
};

const completedRun = {
  runId: "run-1" as never,
  status: "completed" as const,
  assistantMessageId: null,
  requestedAt: "2026-11-24T10:00:00.000Z",
  startedAt: "2026-11-24T10:00:00.000Z",
  completedAt: "2026-11-24T10:05:00.000Z",
};

const pullRequest = (
  snapshot: Partial<NonNullable<ThreadPullRequestLink["snapshot"]>>,
): ThreadPullRequestLink => ({
  host: "github.com",
  repository: "acme/app",
  number: 7,
  url: "https://github.com/acme/app/pull/7",
  source: "created",
  linkedAt: "2026-11-24T10:00:00.000Z",
  stack: null,
  snapshot: {
    state: "open",
    title: "Fix",
    headBranch: "fix",
    baseBranch: "main",
    isDraft: true,
    updatedAt: null,
    syncedAt: "2026-11-24T10:00:00.000Z",
    ...snapshot,
  },
});

describe("threadMatchesPanelFilter", () => {
  it("files each thread state under the filter that asks for it", () => {
    const awaitingInput = { ...idle, hasPendingUserInput: true };
    const unread = { ...idle, latestRun: completedRun, lastVisitedAt: "2026-11-24T10:01:00.000Z" };
    const seen = { ...unread, lastVisitedAt: "2026-11-24T10:06:00.000Z" };
    const failingChecks = { ...idle, pullRequests: [pullRequest({ checksState: "failing" })] };
    const conflicting = { ...idle, pullRequests: [pullRequest({ mergeability: "conflicting" })] };
    const mergedWithFailures = {
      ...idle,
      pullRequests: [pullRequest({ state: "merged", checksState: "failing" })],
    };

    expect(threadMatchesPanelFilter(awaitingInput, "attention")).toBe(true);
    expect(threadMatchesPanelFilter(unread, "unread")).toBe(true);
    expect(threadMatchesPanelFilter(seen, "unread")).toBe(false);
    expect(threadMatchesPanelFilter(failingChecks, "failing")).toBe(true);
    expect(threadMatchesPanelFilter(conflicting, "failing")).toBe(true);
    // A merged pull request no longer needs anything, whatever its last checks said.
    expect(threadMatchesPanelFilter(mergedWithFailures, "failing")).toBe(false);
    expect(threadMatchesPanelFilter(idle, "attention")).toBe(false);
    expect(threadMatchesPanelFilter(idle, "all")).toBe(true);
  });
});

describe("countThreadsByPanelFilter", () => {
  it("counts a thread under every filter it matches", () => {
    const counts = countThreadsByPanelFilter([
      idle,
      {
        ...idle,
        hasPendingApprovals: true,
        pullRequests: [pullRequest({ checksState: "failing" })],
      },
    ]);
    expect(counts).toEqual({ all: 2, attention: 1, failing: 1, unread: 0, working: 0 });
  });
});
