import { useRef, useState } from "react";
import type { MatteBoard, MatteTaskStatus } from "@t3tools/contracts";
import { PlusIcon } from "lucide-react";
import { Textarea } from "../components/ui/textarea";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogPanel,
  DialogFooter,
  DialogTrigger,
} from "../components/ui/dialog";
import { randomUUID } from "../lib/utils";
import { Choice, stages } from "./controls";
import type { Save } from "./Board";

export function NewTaskDialog({
  board,
  save,
  disabled,
  openTask,
}: {
  board: MatteBoard;
  save: Save;
  disabled: boolean;
  openTask: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState(""),
    [notes, setNotes] = useState(""),
    [status, setStatus] = useState<MatteTaskStatus>("todo");
  const titleRef = useRef<HTMLInputElement>(null);
  const [failure, setFailure] = useState(false);
  const submit = async () => {
    if (!title.trim() || disabled) return;
    const task = {
      id: randomUUID(),
      title: title.trim(),
      notes,
      status,
      workspace: "worktree" as const,
      branch: null,
      worktreePath: null,
      threadIds: [],
    };
    if (!(await save({ ...board, tasks: [...board.tasks, task] }))) {
      setFailure(true);
      return;
    }
    setOpen(false);
    setTitle("");
    setNotes("");
    setStatus("todo");
    setFailure(false);
    openTask(task.id);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="self-start">
        <DialogTrigger render={<Button variant="secondary" size="sm" disabled={disabled} />}>
          <PlusIcon />
          Nuovo task
        </DialogTrigger>
      </div>
      <DialogPopup initialFocus={titleRef}>
        <DialogHeader>
          <DialogTitle>Nuovo task</DialogTitle>
        </DialogHeader>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.requestSubmit();
            }
          }}
        >
          <DialogPanel>
            <input
              ref={titleRef}
              className="w-full bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground"
              aria-label="Titolo del task"
              placeholder="Titolo del task"
              maxLength={240}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <label className="grid gap-1.5 text-sm font-medium">
              Descrizione
              <Textarea
                rows={4}
                maxLength={6000}
                placeholder="Descrivi il lavoro da fare e il risultato atteso…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Stato{" "}
              <Choice
                compact
                label="Stato iniziale"
                value={status}
                items={stages}
                onChange={(v) => {
                  const stage = stages.find((s) => s.value === v);
                  if (stage) setStatus(stage.value);
                }}
              />
            </div>
            {failure && (
              <p role="alert" className="text-sm text-destructive">
                Task non salvato. La bozza è ancora qui; riprova dopo aver verificato la board.
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Chiudi
            </Button>
            <Button type="submit" disabled={disabled || !title.trim()}>
              Crea task
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
