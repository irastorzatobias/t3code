import type { ScopedThreadRef } from "@t3tools/contracts";
import { T, useGT, useMessages } from "gt-react";
import { CalendarClockIcon } from "lucide-react";

import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { ScheduledRelativeLabel } from "../settings/ScheduledTasksSettings";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { ThreadAutomationsPanel } from "./ThreadAutomationsPanel";

/**
 * A thread a scheduled task drives (a listener's rounds) shows when it next runs, and opens
 * that task's controls: run now, pause, edit. Threads without one render nothing.
 */
export function ThreadAutomationsHeaderControl({ threadRef }: { threadRef: ScopedThreadRef }) {
  const gt = useGT();
  const tasksQuery = useEnvironmentQuery(
    serverEnvironment.scheduledTasksLive({ environmentId: threadRef.environmentId, input: {} }),
    useMessages(),
  );
  const boundTasks = (tasksQuery.data?.tasks ?? []).filter(
    (task) => task.threadId === threadRef.threadId,
  );
  if (boundTasks.length === 0) return null;

  // The soonest enabled run speaks for the thread; with none enabled, it is paused.
  const nextRunAt =
    boundTasks
      .flatMap((task) => (task.enabled && task.nextRunAt !== null ? [task.nextRunAt] : []))
      .toSorted()[0] ?? null;
  const running = boundTasks.some((task) => task.lastRunStatus === "running");

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            size="xs"
            variant="ghost-muted"
            aria-label={gt("Automations for this thread")}
            className="shrink-0"
          />
        }
      >
        <CalendarClockIcon aria-hidden />
        {running ? (
          <T context="automation state">running</T>
        ) : nextRunAt !== null ? (
          <ScheduledRelativeLabel value={nextRunAt} />
        ) : (
          <T context="automation state">paused</T>
        )}
      </PopoverTrigger>
      <PopoverPopup align="end" side="bottom" className="w-80">
        <ThreadAutomationsPanel
          environmentId={threadRef.environmentId}
          threadId={threadRef.threadId}
        />
      </PopoverPopup>
    </Popover>
  );
}
