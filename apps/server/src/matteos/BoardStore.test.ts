import { assert, it } from "@effect/vitest";
import { emptyMatteBoard, ProjectId, RunId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as SqlClient from "effect/sql/SqlClient";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as BoardStore from "./BoardStore.ts";

it.effect(
  "keeps roadmap order, isolates task conversations and rejects concurrent stale edits",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const projectId = ProjectId.make("demo");
      yield* sql`INSERT INTO projection_projects (project_id,title,workspace_root,scripts_json,created_at,updated_at)
      VALUES (${projectId}, 'Demo', '/demo', '[]', '2026-11-06', '2026-11-06')`;
      const store = yield* BoardStore.make;
      const projectChat = ThreadId.make("overview"),
        codingChat = ThreadId.make("coding"),
        reviewChat = ThreadId.make("review");
      const task = {
        id: "a",
        title: "New checkout",
        notes: "Isolate test data",
        status: "doing" as const,
        workspace: "worktree" as const,
        branch: "feat/checkout",
        worktreePath: "/worktrees/checkout",
        threadIds: [codingChat, reviewChat],
      };
      yield* sql`INSERT INTO orchestration_v2_projection_threads
        (thread_id,project_id,title,default_provider,runtime_mode,interaction_mode,created_at,updated_at,payload_json)
        VALUES (${codingChat},${projectId},'Coding','codex','full-access','default','2026-11-06','2026-11-06',
        ${JSON.stringify({ branch: task.branch, worktreePath: task.worktreePath })})`;
      const board = {
        ...emptyMatteBoard,
        roadmap: "Ship a prototype",
        context: "Desktop first",
        projectThreadId: projectChat,
        tasks: [
          task,
          {
            ...task,
            id: "b",
            title: "Second milestone",
            branch: null,
            worktreePath: null,
            threadIds: [],
          },
        ],
      };
      yield* store.write({ projectId, revision: 0, board });
      const otherClient = yield* BoardStore.make;
      assert.deepEqual(yield* otherClient.read(projectId), { revision: 1, board });
      const firstRun = RunId.make("first");
      const projectContext = yield* store.contextFor(projectId, projectChat, firstRun);
      assert.include(projectContext, "Second milestone");
      for (const threadId of [codingChat, reviewChat]) {
        const text = yield* store.contextFor(projectId, threadId, firstRun);
        assert.include(text, "Ship a prototype");
        assert.include(text, "Isolate test data");
        assert.notInclude(text, "Second milestone");
      }
      assert.isNull(yield* store.contextFor(projectId, ThreadId.make("unlinked"), firstRun));
      assert.isNull(
        yield* store.contextFor(ProjectId.make("another-project"), codingChat, firstRun),
      );
      yield* store.write({ projectId, revision: 1, board: { ...board, roadmap: "Revised" } });
      assert.include(
        (yield* otherClient.write({ projectId, revision: 1, board }).pipe(Effect.flip)).message,
        "altra finestra",
      );
      assert.include(yield* store.contextFor(projectId, codingChat, firstRun), "Ship a prototype");
      assert.include(yield* store.contextFor(projectId, codingChat, RunId.make("next")), "Revised");
      assert.equal((yield* store.read(projectId)).revision, 2);
    }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect("recovers from deleted or moved threads without losing pending launches", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const projectId = ProjectId.make("alpha");
    yield* sql`INSERT INTO projection_projects (project_id,title,workspace_root,scripts_json,created_at,updated_at)
      VALUES (${projectId}, 'Alpha', '/alpha', '[]', '2026-11-06', '2026-11-06')`;
    const primary = ThreadId.make("primary");
    const surviving = ThreadId.make("surviving");
    const pending = ThreadId.make("pending");
    const overview = ThreadId.make("overview");
    const store = yield* BoardStore.make;
    const board = {
      ...emptyMatteBoard,
      projectThreadId: overview,
      tasks: [
        {
          id: "a",
          title: "Parallel",
          notes: "",
          status: "todo" as const,
          workspace: "worktree" as const,
          branch: null,
          worktreePath: null,
          threadIds: [primary, surviving, pending],
        },
      ],
    };
    yield* store.write({ projectId, revision: 0, board });
    for (const [id, owner, removed] of [
      [primary, projectId, true],
      [surviving, projectId, false],
      [overview, "another", false],
    ] as const) {
      yield* sql`INSERT INTO orchestration_v2_projection_threads
        (thread_id,project_id,title,default_provider,runtime_mode,interaction_mode,created_at,updated_at,deleted_at,payload_json)
        VALUES (${id},${owner},'Test','codex','full-access','default','2026-11-06','2026-11-06',
        ${removed ? "2026-11-06" : null},${JSON.stringify({ branch: "feat/live", worktreePath: "/worktrees/live" })})`;
    }
    const current = yield* store.read(projectId);
    assert.isNull(current.board.projectThreadId);
    assert.deepEqual(current.board.tasks[0]?.threadIds, [surviving, pending]);
    assert.equal(current.board.tasks[0]?.worktreePath, "/worktrees/live");
    assert.isNull(yield* store.contextFor(projectId, primary, RunId.make("late")));
    assert.isNull(yield* store.contextFor(projectId, overview, RunId.make("foreign")));
    assert.isTrue(
      (yield* Effect.result(store.write({ projectId, revision: 1, board })))._tag === "Failure",
    );
    const replacement = ThreadId.make("new-overview");
    yield* store.write({
      projectId,
      revision: 1,
      board: { ...current.board, projectThreadId: replacement },
    });
    assert.include(yield* store.contextFor(projectId, replacement, RunId.make("new")), "Parallel");
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);

it.effect("reopens the saved board through a fresh SQLite connection", () =>
  Effect.gen(function* () {
    const dir = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped({
      prefix: "matteos-board-",
    });
    const path = (yield* Path.Path).join(dir, "fixture.sqlite");
    const projectId = ProjectId.make("restart");
    const first = yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT INTO projection_projects (project_id,title,workspace_root,scripts_json,created_at,updated_at)
        VALUES (${projectId}, 'Restart', '/fixture', '[]', '2026-11-06', '2026-11-06')`;
      const store = yield* BoardStore.make;
      return yield* store.write({
        projectId,
        revision: 0,
        board: {
          ...emptyMatteBoard,
          roadmap: "Consegna",
          projectThreadId: ThreadId.make("planning"),
        },
      });
    }).pipe(Effect.provide(SqlitePersistence.layerFromPath(path)));
    const recovered = yield* Effect.gen(function* () {
      return yield* (yield* BoardStore.make).read(projectId);
    }).pipe(Effect.provide(SqlitePersistence.layerFromPath(path)));
    assert.deepEqual(recovered, first);
  }).pipe(Effect.provide(NodeServices.layer)),
);
