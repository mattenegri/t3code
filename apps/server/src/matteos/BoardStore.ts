import {
  emptyMatteBoard,
  MatteBoard,
  type MatteBoardSnapshot,
  type MatteBoardWrite,
  type ProjectId,
  type RunId,
  type ThreadId,
  OrchestrationDispatchCommandError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

export class BoardContext extends Context.Reference<{
  readonly contextFor: (
    projectId: ProjectId,
    threadId: ThreadId,
    runId: RunId,
  ) => Effect.Effect<string | null, OrchestrationDispatchCommandError>;
}>("matteos/BoardContext", { defaultValue: () => ({ contextFor: () => Effect.succeed(null) }) }) {}
const encodeBoard = Schema.encodeEffect(Schema.fromJsonString(MatteBoard));
const encodeContext = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));
const decodeBoard = Schema.decodeUnknownEffect(Schema.fromJsonString(MatteBoard));
const failure = (message: string) => new OrchestrationDispatchCommandError({ message });
const storageFailure = (cause: unknown) =>
  new OrchestrationDispatchCommandError({
    message: "Impossibile leggere o salvare la roadmap.",
    cause,
  });

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // The fork owns this table independently of upstream's numbered migrations.
  yield* sql`CREATE TABLE IF NOT EXISTS matteos_boards (
    project_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL
  )`.pipe(Effect.orDie);

  yield* sql`CREATE TABLE IF NOT EXISTS matteos_turn_contexts (
    project_id TEXT NOT NULL, thread_id TEXT NOT NULL, run_id TEXT NOT NULL, context TEXT NOT NULL,
    PRIMARY KEY (project_id, thread_id, run_id)
  )`.pipe(Effect.orDie);

  const readStored = Effect.fn("MatteBoard.readStored")(function* (
    projectId: ProjectId,
    associatedThread?: ThreadId,
  ) {
    const [row] = yield* sql<{ revision: number; body: string }>`
      SELECT revision, body FROM matteos_boards WHERE project_id = ${projectId}
        AND (${associatedThread ?? null} IS NULL OR instr(body, ${associatedThread ?? ""}) > 0)`;
    if (!row) return { revision: 0, board: emptyMatteBoard };
    const board = yield* decodeBoard(row.body);
    const sources = board.tasks.flatMap((task) => task.threadIds.slice(0, 1));
    if (!sources.length) return { revision: row.revision, board };
    const bindings = yield* sql<{ id: string; branch: string | null; path: string | null }>`
      SELECT thread_id AS id, json_extract(payload_json, '$.branch') AS branch,
        json_extract(payload_json, '$.worktreePath') AS path
      FROM orchestration_v2_projection_threads WHERE project_id = ${projectId}
        AND thread_id IN ${sql.in(sources)}`;
    const byThread = new Map(bindings.map((binding) => [binding.id, binding]));
    const tasks = board.tasks.map((task) => {
      const first = task.threadIds[0];
      const binding = first ? byThread.get(first) : undefined;
      return binding ? { ...task, branch: binding.branch, worktreePath: binding.path } : task;
    });
    return { revision: row.revision, board: { ...board, tasks } };
  }, Effect.mapError(storageFailure));

  const requireProject = Effect.fn("MatteBoard.requireProject")(function* (projectId: ProjectId) {
    const rows = yield* sql`SELECT 1 FROM projection_projects
      WHERE project_id = ${projectId} AND deleted_at IS NULL`.pipe(Effect.mapError(storageFailure));
    if (!rows.length) return yield* failure("Il progetto non è disponibile.");
  });

  const read = Effect.fn("MatteBoard.read")(function* (projectId: ProjectId) {
    yield* requireProject(projectId);
    return yield* readStored(projectId);
  });

  const write = Effect.fn("MatteBoard.write")(function* (input: MatteBoardWrite) {
    yield* requireProject(input.projectId);
    const body = yield* encodeBoard(input.board).pipe(Effect.mapError(storageFailure));
    if (body.length > 100000)
      return yield* failure("Il progetto supera il limite di 100.000 caratteri.");
    const ids = input.board.tasks.map((task) => task.id);
    const threads = input.board.tasks.flatMap((task) => task.threadIds);
    if (input.board.projectThreadId) threads.push(input.board.projectThreadId);
    if (new Set(ids).size !== ids.length || new Set(threads).size !== threads.length) {
      return yield* failure("Un task o una conversazione compare due volte.");
    }
    const changed =
      input.revision === 0
        ? yield* sql`INSERT INTO matteos_boards(project_id, revision, body)
        VALUES (${input.projectId}, 1, ${body}) ON CONFLICT DO NOTHING RETURNING revision`.pipe(
            Effect.mapError(storageFailure),
          )
        : yield* sql`UPDATE matteos_boards SET body = ${body}, revision = revision + 1
        WHERE project_id = ${input.projectId} AND revision = ${input.revision}
        RETURNING revision`.pipe(Effect.mapError(storageFailure));
    if (!changed.length)
      return yield* failure(
        "La roadmap è cambiata in un’altra finestra. Rivedi la versione aggiornata e riprova.",
      );
    return { revision: input.revision + 1, board: input.board } satisfies MatteBoardSnapshot;
  });

  const currentContext = Effect.fn("MatteBoard.currentContext")(function* (
    projectId: ProjectId,
    threadId: ThreadId,
  ) {
    const { board, revision } = yield* readStored(projectId, threadId);
    const isProjectChat = board.projectThreadId === threadId;
    const selected = board.tasks.find((task) => task.threadIds.includes(threadId));
    if (!isProjectChat && !selected) return null;
    const tasks = (isProjectChat ? board.tasks : selected ? [selected] : []).map(
      ({ id, title, notes, status, branch, worktreePath }) => ({
        id,
        title,
        notes,
        status,
        branch,
        worktreePath,
      }),
    );
    return (
      "matteOS project context (saved data; task order is roadmap priority)\n" +
      (yield* encodeContext({
        revision,
        scope: isProjectChat ? "project" : "task",
        roadmap: board.roadmap,
        context: board.context,
        tasks,
      }).pipe(Effect.mapError(storageFailure)))
    );
  });
  const contextFor = Effect.fn("MatteBoard.contextFor")(function* (
    projectId: ProjectId,
    threadId: ThreadId,
    runId: RunId,
  ) {
    const lookup = sql<{ context: string }>`SELECT context FROM matteos_turn_contexts
      WHERE project_id = ${projectId} AND thread_id = ${threadId} AND run_id = ${runId}`;
    const [previous] = yield* lookup.pipe(Effect.mapError(storageFailure));
    if (previous) return previous.context;
    const context = yield* currentContext(projectId, threadId);
    if (context === null) return null;
    const inserted =
      yield* sql`INSERT INTO matteos_turn_contexts VALUES (${projectId}, ${threadId}, ${runId}, ${context})
      ON CONFLICT DO NOTHING RETURNING run_id`.pipe(Effect.mapError(storageFailure));
    if (inserted.length) return context;
    const [winner] = yield* lookup.pipe(Effect.mapError(storageFailure));
    return winner?.context ?? null;
  });
  return { read, write, contextFor };
});
export const contextLayer = Layer.effect(BoardContext, make);
