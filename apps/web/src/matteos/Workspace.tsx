import { useId, useRef, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import {
  ArrowLeftIcon,
  Columns3Icon,
  BookOpenIcon,
  ListIcon,
  MapIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import { AuthOrchestrationReadScope, type MatteBoard } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { useProjects, useThreadShellsForProjectRefs } from "../state/entities";
import { useEnvironmentScope } from "../state/session";
import { useEnvironmentQuery } from "../state/query";
import { useAtomCommand } from "../state/use-atom-command";
import { vcsEnvironment } from "../state/vcs";
import { isElectron } from "../env";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { observeResize } from "../lib/observeResize";
import { WorkspacePageHeader } from "../components/WorkspacePageHeader";
import { SidebarInset } from "../components/ui/sidebar";
import { Button } from "../components/ui/button";
import { Conversation } from "./Conversation";
import { ProjectNoteEditor, TaskCollection, TaskDetail, type Save } from "./Board";
import { scopedProjectKey } from "@t3tools/client-runtime/environment";
import { lastBoardWrite, readBoard, saveBoard } from "./atoms";
import { Choice } from "./controls";

export function MatteWorkspace({
  projectId,
  environmentId,
  chooseProject,
  taskId,
  chooseTask,
}: {
  projectId: string | undefined;
  environmentId: string | undefined;
  taskId: string | undefined;
  chooseTask: (env: string, project: string, task: string | null) => void;
  chooseProject: (env: string, project: string) => void;
}) {
  const projects = useProjects().filter((p) => !p.archivedAt);
  const project = projectId
    ? projects.find((p) => p.id === projectId && p.environmentId === environmentId)
    : projects[0];
  const [split, setSplit] = useState(false);
  const measure = (element: HTMLElement | null) => {
    if (!element) return;
    const update = () => setSplit(element.clientWidth >= 1024);
    update();
    return observeResize(element, update);
  };
  const [desktopChat, setDesktopChat] = useLocalStorage("matteos:chat-open", true, Schema.Boolean);
  const [compactChat, setCompactChat] = useState(false);
  const chatOpen = split ? desktopChat : compactChat;
  const setChatOpen = split ? setDesktopChat : setCompactChat;
  const chatId = useId();
  const chatAction = !chatOpen ? "Mostra chat" : split ? "Nascondi chat" : "Torna ai task";
  return (
    <SidebarInset ref={measure} className="h-dvh min-h-0 overflow-hidden">
      <WorkspacePageHeader electron={isElectron} className="border-b border-border">
        <h1 className="text-base font-semibold">Task</h1>
        {projects.length > 0 && (
          <div className="max-w-64 min-w-0 [-webkit-app-region:no-drag]">
            <Choice
              label="Progetto"
              value={project ? JSON.stringify([project.environmentId, project.id]) : ""}
              items={projects.map((p) => ({
                value: JSON.stringify([p.environmentId, p.id]),
                label: p.title,
              }))}
              onChange={(v) => {
                const p = projects.find(
                  (item) => JSON.stringify([item.environmentId, item.id]) === v,
                );
                if (p) {
                  setCompactChat(false);
                  chooseProject(p.environmentId, p.id);
                }
              }}
            />
          </div>
        )}
        {project && (
          <div className="ml-auto shrink-0 [-webkit-app-region:no-drag]">
            <Button
              size="sm"
              variant={chatOpen ? "secondary" : "ghost-muted"}
              aria-label={chatAction}
              title={chatAction}
              aria-expanded={chatOpen}
              aria-controls={chatId}
              onClick={() => setChatOpen(!chatOpen)}
            >
              {chatOpen ? (
                split ? (
                  <PanelRightCloseIcon />
                ) : (
                  <ArrowLeftIcon />
                )
              ) : (
                <PanelRightOpenIcon />
              )}
              {chatOpen && !split ? "Task" : "Chat roadmap"}
            </Button>
          </div>
        )}
      </WorkspacePageHeader>
      {project ? (
        <ProjectBoard
          key={JSON.stringify([project.environmentId, project.id])}
          project={project}
          split={split}
          chatOpen={chatOpen}
          chatId={chatId}
          taskId={taskId}
          setTaskId={(id) => chooseTask(project.environmentId, project.id, id)}
        />
      ) : (
        <p className="p-5 text-sm text-muted-foreground">
          {projectId
            ? "Seleziona un progetto disponibile."
            : "Aggiungi un progetto in T3 per aprire i task."}
        </p>
      )}
    </SidebarInset>
  );
}

function ProjectBoard({
  project,
  split,
  chatOpen,
  chatId,
  taskId,
  setTaskId,
}: {
  project: EnvironmentProject;
  split: boolean;
  chatOpen: boolean;
  chatId: string;
  taskId: string | undefined;
  setTaskId: (task: string | null) => void;
}) {
  const projectRef = { environmentId: project.environmentId, projectId: project.id };
  const canRead = useEnvironmentScope(project.environmentId, AuthOrchestrationReadScope);
  const server = useEnvironmentQuery(
    canRead
      ? readBoard({ environmentId: project.environmentId, input: { projectId: project.id } })
      : null,
  );
  const shells = useThreadShellsForProjectRefs([projectRef]);
  const write = useAtomCommand(saveBoard, { reportFailure: false });
  const writable = useAtomValue(saveBoard.permissionAtom(project.environmentId));
  const local = useAtomValue(lastBoardWrite(scopedProjectKey(projectRef)));
  const snapshot = !canRead
    ? null
    : local && server.data && local.revision > server.data.revision
      ? local
      : server.data;
  const rootStatus = useEnvironmentQuery(
    snapshot?.board.tasks.some(
      (t) =>
        (t.id === taskId && !t.worktreePath) || (t.workspace === "root" && t.threadIds.length > 0),
    )
      ? vcsEnvironment.status({
          environmentId: project.environmentId,
          input: { cwd: project.workspaceRoot },
        })
      : null,
  );
  const [saving, setSaving] = useState(false),
    inFlight = useRef(false);
  const [error, setError] = useState("");
  const [list, setList] = useState(false);
  const [section, setSection] = useState<"tasks" | "roadmap" | "context">("tasks");
  const save: Save = async (board: MatteBoard, version?: number) => {
    if (!snapshot || !writable || inFlight.current) return false;
    inFlight.current = true;
    setSaving(true);
    setError("");
    return write({
      environmentId: project.environmentId,
      input: { projectId: project.id, revision: version ?? snapshot.revision, board },
    })
      .then((result) => {
        if (result._tag !== "Success")
          throw new Error(
            result._tag === "Failure"
              ? String(Cause.squash(result.cause))
              : "Salvataggio interrotto.",
          );

        return true;
      })
      .catch((error: unknown) => {
        setError(error instanceof Error ? error.message : "Salvataggio non riuscito.");
        return false;
      })
      .finally(() => {
        inFlight.current = false;
        setSaving(false);
      });
  };
  if (!snapshot)
    return (
      <div role="status" className="p-4 text-sm text-muted-foreground">
        {!canRead
          ? "Servono i permessi di lettura per aprire la roadmap."
          : (server.error ?? "Caricamento della roadmap…")}
        {server.error && (
          <Button variant="ghost" onClick={server.refresh}>
            Riprova
          </Button>
        )}
      </div>
    );
  const { board, revision } = snapshot;
  const selected = board.tasks.find((t) => t.id === taskId);
  const props = { board, revision, save, disabled: saving || !writable };
  const titles = new Map(shells.map((s) => [s.id, s.title]));
  const shownTasks = board.tasks.map((t) => {
    const first = shells.find((s) => s.id === t.threadIds[0]);
    const rootBranch =
      t.workspace === "root" && t.threadIds.length ? rootStatus.data?.refName : null;
    return {
      ...t,
      branch: rootBranch ?? first?.branch ?? t.branch,
      worktreePath: first ? first.worktreePath : t.worktreePath,
    };
  });
  return (
    <>
      {(error || server.error) && (
        <div role="alert" className="border-b border-border px-4 py-2 text-sm text-destructive">
          {error || server.error}
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section
          aria-label="Pianificazione"
          className={
            (!split && chatOpen ? "hidden" : "flex") +
            " min-w-0 flex-[1.45] flex-col gap-4 overflow-auto p-4"
          }
        >
          {!selected && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  aria-pressed={!list && section === "tasks"}
                  variant={!list && section === "tasks" ? "secondary" : "ghost-muted"}
                  onClick={() => {
                    setList(false);
                    setSection("tasks");
                    setTaskId(null);
                  }}
                >
                  <Columns3Icon />
                  Kanban
                </Button>
                <Button
                  size="sm"
                  aria-pressed={list && section === "tasks"}
                  variant={list && section === "tasks" ? "secondary" : "ghost-muted"}
                  onClick={() => {
                    setList(true);
                    setSection("tasks");
                    setTaskId(null);
                  }}
                >
                  <ListIcon />
                  Lista
                </Button>
              </div>
              <div className="flex items-center gap-1">
                {(["roadmap", "context"] as const).map((field) => (
                  <Button
                    key={field}
                    size="sm"
                    aria-pressed={section === field}
                    variant={section === field ? "secondary" : "ghost-muted"}
                    onClick={() => setSection(section === field ? "tasks" : field)}
                  >
                    {field === "roadmap" ? <MapIcon /> : <BookOpenIcon />}
                    {field === "roadmap" ? "Roadmap" : "Contesto"}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {(["roadmap", "context"] as const).map((field) => (
            <ProjectNoteEditor
              key={field}
              {...props}
              field={field}
              active={!selected && section === field}
              close={() => setSection((current) => (current === field ? "tasks" : current))}
            />
          ))}
          {(selected || section === "tasks") &&
            (selected ? (
              <TaskDetail
                key={selected.id}
                {...props}
                task={shownTasks.find((t) => t.id === selected.id) ?? selected}
                titles={titles}
                close={() => setTaskId(null)}
                project={project}
                pendingThreadIds={snapshot.pendingThreadIds ?? []}
                canUseWorktree={!project.isScratch && rootStatus.data?.isRepo !== false}
              />
            ) : (
              <TaskCollection
                {...props}
                board={{ ...board, tasks: shownTasks }}
                openTask={setTaskId}
                list={list}
              />
            ))}
        </section>

        <aside
          id={chatId}
          hidden={!chatOpen}
          aria-label="Conversazione"
          className={
            "min-h-0 min-w-0 flex-1 overflow-hidden" + (split ? " border-l border-border" : "")
          }
        >
          <Conversation
            project={project}
            board={board}
            visible={chatOpen}
            shells={shells}
            save={save}
            disabled={props.disabled}
          />
        </aside>
      </div>
    </>
  );
}
