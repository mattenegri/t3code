import { type EnvironmentId, type MatteTask, type ThreadId } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import type { ServerSettings } from "@t3tools/contracts/settings";
import { DraftId, useComposerDraftStore } from "../composerDraftStore";

const prefix = "matteos-task:";
export const isTaskDraft = (id: DraftId | null) => id?.startsWith(prefix) === true;

function taskDraftId(environmentId: EnvironmentId, threadId: ThreadId) {
  return DraftId.make(prefix + environmentId + ":" + threadId);
}

export function prepareTaskDraft(
  project: EnvironmentProject,
  task: MatteTask,
  threadId: ThreadId,
  settings: ServerSettings,
) {
  const draftId = taskDraftId(project.environmentId, threadId);
  const store = useComposerDraftStore.getState();
  if (!store.getDraftSession(draftId)) {
    const defaults = resolveProjectSettings(settings, project.id, project).settings;
    const newWorktree = !project.isScratch && task.workspace === "worktree" && !task.worktreePath;
    store.setLogicalProjectDraftThreadId(
      draftId,
      { environmentId: project.environmentId, projectId: project.id },
      draftId,
      {
        threadId,
        environmentSelection: "manual",
        worktreePath: task.worktreePath,
        envMode: newWorktree ? "worktree" : "local",
        branch: task.branch ?? (newWorktree ? "HEAD" : null),
        runtimeMode: defaults.defaultRuntimeMode,
        startFromOrigin: false,
      },
    );
    store.applyStickyState(draftId);
    if (defaults.defaultModelSelection)
      store.setModelSelection(draftId, defaults.defaultModelSelection, { replaceOptions: true });
  }
  return draftId;
}
