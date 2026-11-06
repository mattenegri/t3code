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

  const resolveThreads = Effect.fn("MatteBoard.resolveThreads")(function* (
    projectId: ProjectId,
    board: MatteBoard,
    strict: boolean,
  ) {
    const ids = board.tasks.flatMap((task) => task.threadIds);
    if (board.projectThreadId) ids.push(board.projectThreadId);
    const rows = ids.length
      ? yield* sql<{
          id: ThreadId;
          owner: ProjectId;
          deleted: string | null;
          branch: string | null;
          path: string | null;
        }>`
      SELECT thread_id AS id, project_id AS owner, deleted_at AS deleted,
        json_extract(payload_json, '$.branch') AS branch, json_extract(payload_json, '$.worktreePath') AS path
      FROM orchestration_v2_projection_threads WHERE thread_id IN ${sql.in(ids)}`.pipe(
          Effect.mapError(storageFailure),
        )
      : [];
    const unavailable = new Set(
      rows.filter((r) => r.owner !== projectId || r.deleted !== null).map((r) => r.id),
    );
    if (strict && unavailable.size)
      return yield* failure(
        "Una conversazione è stata eliminata o spostata. Rivedi la roadmap aggiornata.",
      );
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      ...board,
      projectThreadId:
        board.projectThreadId && unavailable.has(board.projectThreadId)
          ? null
          : board.projectThreadId,
      tasks: board.tasks.map((task) => {
        // An id without a projection is reserved before launch so the first turn already has context.
        const threadIds = task.threadIds.filter((id) => !unavailable.has(id));
        const first = threadIds[0];
        const binding = first ? byId.get(first) : undefined;
        return {
          ...task,
          threadIds,
          branch: binding?.branch ?? null,
          worktreePath: binding?.path ?? null,
        };
      }),
    };
  });

  const readStored = Effect.fn("MatteBoard.readStored")(function* (
    projectId: ProjectId,
    associatedThread?: ThreadId,
  ) {
    const [row] = yield* sql<{ revision: number; body: string }>`
      SELECT revision, body FROM matteos_boards WHERE project_id = ${projectId}
        AND (${associatedThread ?? null} IS NULL OR instr(body, json_quote(${associatedThread ?? ""})) > 0)`;
    if (!row) return { revision: 0, board: emptyMatteBoard };
    const board = yield* decodeBoard(row.body);
    return { revision: row.revision, board: yield* resolveThreads(projectId, board, false) };
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
    // Git metadata belongs to T3 and can change without a board revision.
    const body = yield* encodeBoard({
      ...input.board,
      tasks: input.board.tasks.map((task) => ({ ...task, branch: null, worktreePath: null })),
    }).pipe(Effect.mapError(storageFailure));
    if (body.length > 100000)
      return yield* failure("Il progetto supera il limite di 100.000 caratteri.");
    const ids = input.board.tasks.map((task) => task.id);
    const threads = input.board.tasks.flatMap((task) => task.threadIds);
    if (input.board.projectThreadId) threads.push(input.board.projectThreadId);
    if (new Set(ids).size !== ids.length || new Set(threads).size !== threads.length) {
      return yield* failure("Un task o una conversazione compare due volte.");
    }
    const persist = Effect.gen(function* () {
      const board = yield* resolveThreads(input.projectId, input.board, true);
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
      return { revision: input.revision + 1, board } satisfies MatteBoardSnapshot;
    });
    return yield* sql
      .withTransaction(persist)
      .pipe(Effect.catchTags({ SqlError: (error) => Effect.fail(storageFailure(error)) }));
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
