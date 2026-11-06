import { useState } from "react";
import { randomUUID } from "../lib/utils";
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, PlusIcon } from "lucide-react";
import type { MatteBoard, MatteTask, MatteTaskStatus, ThreadId } from "@t3tools/contracts";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Choice, stages, WorkspaceLabel } from "./controls";

export type Save = (board: MatteBoard, expectedRevision?: number) => Promise<boolean>;
type PanelProps = { board: MatteBoard; revision: number; save: Save; disabled: boolean };

function Card({
  task,
  onOpen,
  compact,
}: {
  task: MatteTask;
  onOpen: () => void;
  compact: boolean;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-matteos-task", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onOpen}
      className={
        compact
          ? "grid w-full gap-1.5 border-b border-border/60 px-2 py-3 text-left hover:bg-muted/40"
          : "grid w-full gap-2 rounded-lg border border-border/70 bg-background p-3 text-left shadow-sm hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      }
    >
      <span className="break-words text-sm font-medium">{task.title}</span>
      <WorkspaceLabel branch={task.branch} path={task.worktreePath} />
    </button>
  );
}
export function TaskCollection({
  board,
  save,
  disabled,
  openTask,
  list,
}: {
  board: MatteBoard;
  save: Save;
  disabled: boolean;
  openTask: (id: string) => void;
  list: boolean;
}) {
  const [title, setTitle] = useState("");
  const [over, setOver] = useState<MatteTaskStatus | null>(null);
  const updateStatus = (id: string, status: MatteTaskStatus) => {
    const task = board.tasks.find((t) => t.id === id);
    if (task && task.status !== status && !disabled)
      void save({ ...board, tasks: board.tasks.map((t) => (t.id === id ? { ...t, status } : t)) });
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <form
        className="flex items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const value = title.trim();
          if (!value || disabled) return;
          const task: MatteTask = {
            id: randomUUID(),
            title: value,
            notes: "",
            status: "todo",
            workspace: "worktree",
            branch: null,
            worktreePath: null,
            threadIds: [],
          };
          if (await save({ ...board, tasks: [...board.tasks, task] }))
            setTitle((current) => (current.trim() === value ? "" : current));
        }}
      >
        <div className="min-w-0 flex-1">
          <Input
            readOnly={disabled}
            placeholder="Aggiungi un task…"
            aria-label="Nome del nuovo task"
            maxLength={240}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          size="icon"
          aria-label="Aggiungi task"
          disabled={!title.trim() || disabled}
        >
          <PlusIcon />
        </Button>
      </form>
      {list ? (
        <div className="min-h-0 overflow-y-auto">
          {board.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aggiungi il primo task.</p>
          ) : (
            board.tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <Card task={t} compact onOpen={() => openTask(t.id)} />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {stages.find((s) => s.value === t.status)?.label}
                </span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 auto-cols-[minmax(140px,1fr)] grid-flow-col gap-2 overflow-auto pb-2">
          {stages.map((stage) => {
            const tasks = board.tasks.filter((t) => t.status === stage.value);
            return (
              <section
                key={stage.value}
                aria-label={stage.label}
                onDragOver={(e) => {
                  if (!disabled && e.dataTransfer.types.includes("application/x-matteos-task")) {
                    e.preventDefault();
                    setOver(stage.value);
                  }
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  updateStatus(e.dataTransfer.getData("application/x-matteos-task"), stage.value);
                }}
                className={
                  "min-h-32 rounded-lg p-2 " + (over === stage.value ? "bg-accent" : "bg-muted/40")
                }
              >
                <h3 className="mb-3 flex items-center gap-1.5 text-xs font-medium">
                  <span className={"size-1.5 rounded-full " + stage.dot} />
                  {stage.label}
                  <span className="ml-auto tabular-nums text-muted-foreground">{tasks.length}</span>
                </h3>
                <div className="grid gap-2">
                  {tasks.map((t) => (
                    <Card key={t.id} task={t} compact={false} onOpen={() => openTask(t.id)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function useTextEdit(saved: string) {
  const [draft, setDraft] = useState<{ base: string; value: string } | null>(null);
  const value = draft?.value ?? saved;
  return {
    value,
    saved,
    conflict: draft !== null && draft.base !== saved && value !== saved,
    change: (next: string) =>
      setDraft(
        next === saved
          ? null
          : { base: !draft || draft.value === saved ? saved : draft.base, value: next },
      ),
    useSaved: () => setDraft(null),
    keepDraft: () => setDraft({ base: saved, value }),
  };
}

function EditConflict({ field, label }: { field: ReturnType<typeof useTextEdit>; label: string }) {
  if (!field.conflict) return null;
  return (
    <div role="alert" className="grid gap-1 text-sm">
      <p>{label} è cambiato in un’altra finestra. Versione salvata:</p>
      <p className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
        {field.saved || "(vuoto)"}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={field.useSaved}>
          Usa la versione salvata
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={field.keepDraft}>
          Mantieni la mia modifica
        </Button>
      </div>
    </div>
  );
}

export function RoadmapEditor({
  board,
  revision,
  save,
  disabled,
  close,
}: PanelProps & { close: () => void }) {
  const roadmap = useTextEdit(board.roadmap);
  const context = useTextEdit(board.context);
  const blocked = disabled || roadmap.conflict || context.conflict;
  return (
    <form
      className="grid content-start gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          !blocked &&
          (await save({ ...board, roadmap: roadmap.value, context: context.value }, revision))
        )
          close();
      }}
    >
      <label className="grid gap-1.5 text-sm font-medium">
        Roadmap
        <Textarea
          rows={5}
          readOnly={disabled}
          maxLength={16000}
          value={roadmap.value}
          onChange={(e) => roadmap.change(e.target.value)}
          placeholder="Obiettivi e prossimi passi"
        />
      </label>
      <EditConflict field={roadmap} label="Il testo della roadmap" />
      <label className="grid gap-1.5 text-sm font-medium">
        Contesto del progetto
        <Textarea
          rows={5}
          readOnly={disabled}
          maxLength={16000}
          value={context.value}
          onChange={(e) => context.change(e.target.value)}
          placeholder="Decisioni, materiali e vincoli per gli agenti"
        />
      </label>
      <EditConflict field={context} label="Il contesto" />
      <div className="flex gap-2">
        <Button type="submit" disabled={blocked}>
          Salva
        </Button>
        <Button type="button" variant="ghost" onClick={close}>
          Chiudi
        </Button>
      </div>
    </form>
  );
}

export function TaskDetail({
  board,
  revision,
  task,
  save,
  disabled,
  close,
  openChat,
  newChat,
  titles,
}: PanelProps & {
  task: MatteTask;
  close: () => void;
  openChat: (id: ThreadId) => void;
  newChat: () => void;
  titles: ReadonlyMap<ThreadId, string>;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const update = (patch: Partial<MatteTask>, version?: number) =>
    save(
      { ...board, tasks: board.tasks.map((t) => (t.id === task.id ? { ...t, ...patch } : t)) },
      version,
    );
  const move = (delta: number) => {
    const tasks = board.tasks.slice(),
      index = tasks.findIndex((t) => t.id === task.id);
    if (index + delta < 0 || index + delta >= tasks.length) return;
    tasks.splice(index, 1);
    tasks.splice(index + delta, 0, task);
    void save({ ...board, tasks });
  };
  const index = board.tasks.findIndex((t) => t.id === task.id);
  return (
    <div className="grid content-start gap-4 overflow-y-auto">
      <div>
        <Button variant="ghost" size="sm" onClick={close}>
          <ArrowLeftIcon />
          Tutti i task
        </Button>
      </div>
      {editing ? (
        <TaskEditor
          task={task}
          revision={revision}
          disabled={disabled}
          update={update}
          close={() => setEditing(false)}
        />
      ) : (
        <div className="grid gap-2">
          <div className="flex items-start justify-between gap-2">
            <h2 className="break-words text-xl font-semibold">{task.title}</h2>
            <Button
              variant="ghost-muted"
              size="sm"
              disabled={disabled}
              onClick={() => setEditing(true)}
            >
              Modifica
            </Button>
          </div>
          {task.notes && <p className="whitespace-pre-wrap break-words text-sm">{task.notes}</p>}
          <WorkspaceLabel branch={task.branch} path={task.worktreePath} interactive />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Choice
          label="Stato del task"
          items={stages}
          value={task.status}
          disabled={disabled}
          onChange={(status) => {
            const s = stages.find((i) => i.value === status);
            if (s) void update({ status: s.value });
          }}
        />
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          Priorità {index + 1}
          <Button
            variant="ghost-muted"
            size="icon-xs"
            aria-label="Aumenta priorità"
            disabled={disabled || index === 0}
            onClick={() => move(-1)}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            variant="ghost-muted"
            size="icon-xs"
            aria-label="Riduci priorità"
            disabled={disabled || index === board.tasks.length - 1}
            onClick={() => move(1)}
          >
            <ArrowDownIcon />
          </Button>
        </div>
      </div>
      <section className="grid gap-2 border-t border-border pt-4">
        <h3 className="text-sm font-medium">Conversazioni</h3>
        {task.threadIds.map((id, i) => (
          <Button key={id} variant="outline" size="sm" onClick={() => openChat(id)}>
            {titles.get(id) && titles.get(id) !== task.title
              ? titles.get(id)
              : "Conversazione " + (i + 1)}
          </Button>
        ))}
        <div>
          <Button variant="secondary" size="sm" disabled={disabled} onClick={newChat}>
            <PlusIcon />
            Nuova conversazione
          </Button>
        </div>
      </section>
      <div className="mt-3">
        <Button
          variant="ghost-muted"
          size="xs"
          disabled={disabled}
          onClick={() => setDeleting(!deleting)}
        >
          {deleting ? "Annulla" : "Elimina task"}
        </Button>
        {deleting && (
          <Button
            variant="destructive-outline"
            size="xs"
            disabled={disabled}
            onClick={async () => {
              if (await save({ ...board, tasks: board.tasks.filter((t) => t.id !== task.id) }))
                close();
            }}
          >
            Elimina e conserva le chat
          </Button>
        )}
      </div>
    </div>
  );
}

function TaskEditor({
  task,
  revision,
  disabled,
  update,
  close,
}: {
  task: MatteTask;
  revision: number;
  disabled: boolean;
  update: (patch: Partial<MatteTask>, revision: number) => Promise<boolean>;
  close: () => void;
}) {
  const title = useTextEdit(task.title);
  const notes = useTextEdit(task.notes);
  const blocked = disabled || title.conflict || notes.conflict || !title.value.trim();
  return (
    <form
      className="grid gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!blocked && (await update({ title: title.value.trim(), notes: notes.value }, revision)))
          close();
      }}
    >
      <Input
        readOnly={disabled}
        aria-label="Titolo"
        maxLength={240}
        value={title.value}
        onChange={(e) => title.change(e.target.value)}
      />
      <EditConflict field={title} label="Il titolo" />
      <Textarea
        readOnly={disabled}
        aria-label="Dettagli del task"
        rows={5}
        maxLength={6000}
        value={notes.value}
        onChange={(e) => notes.change(e.target.value)}
      />
      <EditConflict field={notes} label="Il testo del task" />
      <div className="flex gap-2">
        <Button type="submit" disabled={blocked}>
          Salva
        </Button>
        <Button type="button" variant="ghost" onClick={close}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
