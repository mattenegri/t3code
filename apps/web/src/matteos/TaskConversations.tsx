import { useState } from "react";
import { useNavigate, Link, useRouter } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { MessageSquareIcon, PlusIcon, ArrowUpRightIcon } from "lucide-react";
import type { MatteTask, ThreadId } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { serverEnvironment } from "../state/server";
import { Button } from "../components/ui/button";
import { newThreadId } from "../lib/utils";
import { prepareTaskDraft } from "./taskDraft";
import { Choice } from "./controls";

export function TaskConversations({
  project,
  task,
  pendingThreadIds,
  canUseWorktree,
  titles,
  disabled,
  update,
}: {
  project: EnvironmentProject;
  task: MatteTask;
  pendingThreadIds: readonly ThreadId[];
  canUseWorktree: boolean;
  titles: ReadonlyMap<ThreadId, string>;
  disabled: boolean;
  update: (patch: Partial<MatteTask>) => Promise<boolean>;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const config = useAtomValue(serverEnvironment.configValueAtom(project.environmentId));
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const waiting =
    task.workspace === "worktree" &&
    canUseWorktree &&
    task.threadIds.length > 0 &&
    !task.worktreePath;
  const openDraft = (id: ThreadId) => {
    if (!config) return;
    return navigate({
      to: "/draft/$draftId",
      params: {
        draftId: prepareTaskDraft(
          project,
          canUseWorktree ? task : { ...task, workspace: "root" },
          id,
          config.settings,
        ),
      },
    });
  };
  const create = async () => {
    if (opening || disabled || waiting || !config) return;
    setOpening(true);
    setError("");
    const href = router.state.location.href;
    try {
      const id = newThreadId();
      if (
        (await update({
          threadIds: [...task.threadIds, id],
          ...(!canUseWorktree ? { workspace: "root" } : {}),
        })) &&
        router.state.location.href === href
      )
        await openDraft(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossibile aprire la conversazione.");
    }
    setOpening(false);
  };
  return (
    <section className="grid gap-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">
          Conversazioni{" "}
          <span className="ml-1 text-xs text-muted-foreground">{task.threadIds.length}</span>
        </h3>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || opening || waiting || !config}
          onClick={create}
        >
          <PlusIcon />
          Nuova conversazione
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!task.threadIds.length && canUseWorktree && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Spazio di lavoro{" "}
          <Choice
            compact
            label="Spazio di lavoro"
            value={task.workspace}
            disabled={disabled}
            items={[
              { value: "worktree", label: "Worktree dedicato" },
              { value: "root", label: "Checkout del progetto" },
            ]}
            onChange={(v) => void update({ workspace: v === "root" ? "root" : "worktree" })}
          />
        </div>
      )}
      {waiting && (
        <p className="text-xs text-muted-foreground">
          Invia il primo messaggio nella conversazione iniziale per preparare il worktree condiviso.
        </p>
      )}
      {task.threadIds.map((id, i) => {
        const pending = pendingThreadIds.includes(id) && !titles.has(id);
        const name = titles.get(id) || "Conversazione " + (i + 1);
        const content = (
          <>
            <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            {pending && <span className="text-xs text-muted-foreground">Bozza</span>}
            <ArrowUpRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        );
        const row =
          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted focus-visible:outline-ring";
        return pending ? (
          <button
            type="button"
            key={id}
            className={row}
            disabled={!config}
            onClick={() => void openDraft(id)}
          >
            {content}
          </button>
        ) : (
          <Link
            key={id}
            className={row}
            to="/$environmentId/$threadId"
            params={{ environmentId: project.environmentId, threadId: id }}
          >
            {content}
          </Link>
        );
      })}
    </section>
  );
}
