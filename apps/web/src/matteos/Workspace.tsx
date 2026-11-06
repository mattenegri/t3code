import { useId, useRef, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import {
  ArrowLeftIcon,
  Columns3Icon,
  ListIcon,
  MapIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import type { MatteBoard, MatteBoardSnapshot, ThreadId } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { useProjects, useThreadShellsForProjectRefs } from "../state/entities";
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
import { RoadmapEditor, TaskCollection, TaskDetail, type Save } from "./Board";
import { readBoard, saveBoard } from "./atoms";
import { Choice } from "./controls";

export function MatteWorkspace({
  projectId,
  environmentId,
  chooseProject,
}: {
  projectId: string | undefined;
  environmentId: string | undefined;
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
              {chatOpen && !split ? "Task" : "Chat"}
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
          openChat={() => setChatOpen(true)}
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
  openChat,
}: {
  project: EnvironmentProject;
  split: boolean;
  chatOpen: boolean;
  chatId: string;
  openChat: () => void;
}) {
  const projectRef = { environmentId: project.environmentId, projectId: project.id };
  const server = useEnvironmentQuery(
    readBoard({ environmentId: project.environmentId, input: { projectId: project.id } }),
  );
  const shells = useThreadShellsForProjectRefs([projectRef]);
  const write = useAtomCommand(saveBoard, { reportFailure: false });
  const writable = useAtomValue(saveBoard.permissionAtom(project.environmentId));
  const [local, setLocal] = useState<MatteBoardSnapshot | null>(null);
  const snapshot = local && local.revision > (server.data?.revision ?? -1) ? local : server.data;
  const rootStatus = useEnvironmentQuery(
    snapshot?.board.tasks.some((t) => t.workspace === "root" && t.threadIds.length > 0)
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
  const [section, setSection] = useState<"tasks" | "roadmap">("tasks");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [chat, setChat] = useState<{
    taskId: string | null;
    id: ThreadId | null;
    fresh: boolean;
    key: number;
  }>({ taskId: null, id: null, fresh: false, key: 0 });
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
        setLocal(result.value);
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
        {server.error ?? "Caricamento della roadmap…"}
        {server.error && (
          <Button variant="ghost" onClick={server.refresh}>
            Riprova
          </Button>
        )}
      </div>
    );
  const { board, revision } = snapshot;
  const selected = board.tasks.find((t) => t.id === taskId);
  const taskForChat = board.tasks.find((t) => t.id === chat.taskId) ?? null;
  const shownId = taskForChat ? chat.id : board.projectThreadId;
  const switchChat = (taskId: string | null, id: ThreadId | null, fresh: boolean) => {
    setChat((c) => ({ taskId, id, fresh, key: c.key + 1 }));
    openChat();
  };
  const props = { board, revision, save, disabled: saving || !writable };
  const titles = new Map(shells.map((s) => [s.id, s.title]));
  const shownTasks = board.tasks.map((t) => {
    const first = shells.find((s) => s.id === t.threadIds[0]);
    const rootBranch =
      t.workspace === "root" && t.threadIds.length ? rootStatus.data?.refName : null;
    return {
      ...t,
      branch: first?.branch ?? rootBranch ?? t.branch,
      worktreePath: first?.worktreePath ?? t.worktreePath,
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
              <Button
                size="sm"
                aria-pressed={section === "roadmap"}
                variant={section === "roadmap" ? "secondary" : "ghost-muted"}
                onClick={() => {
                  setSection(section === "roadmap" ? "tasks" : "roadmap");
                  setTaskId(null);
                }}
              >
                <MapIcon />
                Roadmap
              </Button>
            </div>
          )}
          {section === "roadmap" ? (
            <RoadmapEditor {...props} close={() => setSection("tasks")} />
          ) : selected ? (
            <TaskDetail
              key={selected.id}
              {...props}
              task={shownTasks.find((t) => t.id === selected.id) ?? selected}
              titles={titles}
              close={() => setTaskId(null)}
              openChat={(id) => switchChat(selected.id, id, false)}
              newChat={() => switchChat(selected.id, null, true)}
            />
          ) : (
            <TaskCollection
              {...props}
              board={{ ...board, tasks: shownTasks }}
              openTask={setTaskId}
              list={list}
            />
          )}
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
            key={chat.key}
            project={project}
            board={board}
            task={taskForChat}
            threadId={shownId}
            isNew={taskForChat ? chat.fresh : false}
            visible={chatOpen}
            shells={shells}
            save={save}
            disabled={props.disabled}
            onOpen={(id) => setChat((c) => ({ ...c, id, fresh: false }))}
            onProject={() => switchChat(null, null, false)}
          />
        </aside>
      </div>
    </>
  );
}
