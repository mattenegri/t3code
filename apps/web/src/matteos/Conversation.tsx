import { useRef, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { useEnvironmentThread } from "../state/threads";
import { ArrowUpIcon, ExternalLinkIcon, MessageSquareIcon } from "lucide-react";
import {
  CommandId,
  type MatteBoard,
  type MatteTask,
  type ModelSelection,
  type ThreadId,
} from "@t3tools/contracts";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import {
  isProviderInstancePickerReady,
  providerInstanceEntriesFor,
  resolveProjectDefaultProviderModelSelection,
} from "../providerInstances";
import ChatView from "../components/ChatView";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { useAtomCommand } from "../state/use-atom-command";
import { serverEnvironment } from "../state/server";
import { newThreadId } from "../lib/utils";
import { buildThreadRouteParams } from "../threadRoutes";
import { launchChat } from "./atoms";
import { Choice } from "./controls";
import type { Save } from "./Board";

export function Conversation({
  project,
  board,
  task,
  threadId,
  isNew,
  shells,
  save,
  onOpen,
  onProject,
  disabled,
}: {
  project: EnvironmentProject;
  board: MatteBoard;
  task: MatteTask | null;
  threadId: ThreadId | null;
  isNew: boolean;
  shells: ReadonlyArray<EnvironmentThreadShell>;
  save: Save;
  onOpen: (id: ThreadId) => void;
  onProject: () => void;
  disabled: boolean;
}) {
  const config = useAtomValue(serverEnvironment.configValueAtom(project.environmentId));
  const launch = useAtomCommand(launchChat, { reportFailure: false });
  const canLaunch = useAtomValue(launchChat.permissionAtom(project.environmentId));
  const [prompt, setPrompt] = useState("");
  const [modelKey, setModelKey] = useState("");
  const [workspace, setWorkspace] = useState<MatteTask["workspace"]>(
    project.isScratch ? "root" : (task?.workspace ?? "worktree"),
  );
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const pending = useRef(false);
  const reserved = useRef<ThreadId | null>(null);
  const ownShell = shells.find((s) => s.id === threadId);
  const detail = useEnvironmentThread(project.environmentId, !isNew && !ownShell ? threadId : null);
  const knownThread =
    !isNew && threadId !== null && (ownShell !== undefined || Option.isSome(detail.data));
  const settings = config && resolveProjectSettings(config.settings, project.id, project).settings;
  const entries = config
    ? providerInstanceEntriesFor(config.providers, config.settings, project.id).filter(
        isProviderInstancePickerReady,
      )
    : [];
  const options = entries.flatMap((entry) =>
    entry.models.map((m) => ({
      key: JSON.stringify([entry.instanceId, m.slug]),
      label: entry.displayName + " · " + m.name,
      selection: { instanceId: entry.instanceId, model: m.slug },
    })),
  );
  const fallback: ModelSelection | null =
    settings?.defaultModelSelection ??
    (config
      ? resolveProjectDefaultProviderModelSelection(config.providers, config.settings, project.id)
      : null);
  const model =
    options.find((o) => o.key === modelKey) ??
    options.find(
      (o) =>
        o.selection.instanceId === fallback?.instanceId && o.selection.model === fallback?.model,
    ) ??
    options[0];
  const primary = task?.threadIds[0];
  const primaryShell = shells.find((s) => s.id === primary);
  const path = primaryShell?.worktreePath ?? task?.worktreePath;
  const branch = primaryShell?.worktreePath ? primaryShell.branch : task?.branch;
  const firstWorkspace = task?.threadIds.length ? task.workspace : workspace;
  const launchFirst = async () => {
    if (pending.current || disabled || !prompt.trim() || !model || !settings || !canLaunch) return;
    pending.current = true;
    setBusy(true);
    setFailure("");
    const send = async () => {
      const id = reserved.current ?? (!isNew ? threadId : null) ?? newThreadId();
      reserved.current = id;
      if (task && primary && id !== primary && task.workspace === "worktree" && !path)
        throw new Error(
          "Attendi la preparazione del primo worktree prima di aprire un’altra conversazione.",
        );
      if (task && !task.threadIds.includes(id)) {
        if (
          !(await save({
            ...board,
            tasks: board.tasks.map((t) =>
              t.id === task.id
                ? { ...t, workspace: firstWorkspace, threadIds: [...t.threadIds, id] }
                : t,
            ),
          }))
        )
          return;
      } else if (!task && board.projectThreadId !== id) {
        if (board.projectThreadId)
          throw new Error("La chat di progetto è già stata aperta. Riaprila dalla roadmap.");
        if (!(await save({ ...board, projectThreadId: id }))) return;
      }
      const result = await launch({
        environmentId: project.environmentId,
        input: {
          commandId: CommandId.make("matteos-launch-" + id),
          threadId: id,
          projectId: project.id,
          title: task?.title ?? "Roadmap",
          generateTitle: false,
          modelSelection: model.selection,
          runtimeMode: settings.defaultRuntimeMode,
          interactionMode: task ? "default" : "plan",
          workspaceStrategy: !task
            ? { type: "root" }
            : path
              ? { type: "existing_worktree", worktreePath: path, ...(branch ? { branch } : {}) }
              : firstWorkspace === "worktree"
                ? { type: "worktree", baseRef: "HEAD" }
                : { type: "root" },
          initialMessage: { text: prompt.trim(), attachments: [] },
        },
      });
      if (result._tag !== "Success")
        throw new Error(
          result._tag === "Failure"
            ? String(Cause.squash(result.cause))
            : "Conversazione non avviata.",
        );
      reserved.current = null;
      setPrompt("");
      onOpen(id);
    };
    await send()
      .catch((error: unknown) => {
        setFailure(error instanceof Error ? error.message : "Impossibile aprire la conversazione.");
      })
      .finally(() => {
        pending.current = false;
        setBusy(false);
      });
  };
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <header className="flex min-h-12 items-center gap-2 border-b border-border px-4">
        <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {task ? task.title : "Chat di progetto"}
        </h2>
        {task && (
          <Button variant="ghost-muted" size="xs" onClick={onProject}>
            Chat di progetto
          </Button>
        )}
        {threadId && !isNew && (
          <Link
            to="/$environmentId/$threadId"
            params={buildThreadRouteParams({ environmentId: project.environmentId, threadId })}
            aria-label="Apri conversazione in T3"
          >
            <ExternalLinkIcon className="size-4" />
          </Link>
        )}
      </header>
      {knownThread && !busy && !failure ? (
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ChatView routeKind="server" environmentId={project.environmentId} threadId={threadId} />
        </div>
      ) : (
        <form
          className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-end gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void launchFirst();
          }}
        >
          <label className="grid gap-2 text-sm text-muted-foreground">
            {task ? "Conversazione del task" : "Roadmap e task inclusi nel contesto"}
            <Textarea
              rows={3}
              aria-label="Messaggio"
              placeholder={
                task
                  ? "Chiedi di valutare o implementare il task…"
                  : "Chiedi da quale task partire…"
              }
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void launchFirst();
                }
              }}
            />
          </label>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
          {!model && config && (
            <p className="text-sm text-muted-foreground">
              Configura un provider nelle impostazioni T3 per avviare la chat.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {model && (
              <Choice
                label="Modello"
                value={model.key}
                items={options.map((m) => ({ label: m.label, value: m.key }))}
                onChange={setModelKey}
              />
            )}
            {task && !primary && !project.isScratch && (
              <Choice
                label="Spazio di lavoro"
                value={workspace}
                items={[
                  { value: "worktree", label: "Nuovo worktree" },
                  { value: "root", label: "Checkout del progetto" },
                ]}
                onChange={(v) => setWorkspace(v === "root" ? "root" : "worktree")}
              />
            )}
            <div className="ml-auto">
              <Button
                type="submit"
                size="icon"
                aria-label="Invia messaggio"
                disabled={disabled || busy || !prompt.trim() || !model || !canLaunch}
              >
                <ArrowUpIcon />
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
