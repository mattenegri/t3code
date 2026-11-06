import * as Schema from "effect/Schema";
import { NonNegativeInt, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const MatteTaskStatus = Schema.Literals(["todo", "doing", "review", "done"]);
export type MatteTaskStatus = typeof MatteTaskStatus.Type;
export const MatteTask = Schema.Struct({
  id: TrimmedNonEmptyString.check(Schema.isMaxLength(100)),
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(240)),
  notes: Schema.String.check(Schema.isMaxLength(6000)),
  status: MatteTaskStatus,
  workspace: Schema.Literals(["worktree", "root"]),
  threadIds: Schema.Array(ThreadId).check(Schema.isMaxLength(64)),
  branch: Schema.NullOr(TrimmedNonEmptyString),
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
});
export type MatteTask = typeof MatteTask.Type;
export const MatteBoard = Schema.Struct({
  roadmap: Schema.String.check(Schema.isMaxLength(16000)),
  context: Schema.String.check(Schema.isMaxLength(16000)),
  projectThreadId: Schema.NullOr(ThreadId),
  tasks: Schema.Array(MatteTask).check(Schema.isMaxLength(300)),
});
export type MatteBoard = typeof MatteBoard.Type;
export const MatteBoardSnapshot = Schema.Struct({
  revision: NonNegativeInt,
  board: MatteBoard,
  pendingThreadIds: Schema.optional(Schema.Array(ThreadId)),
});
export type MatteBoardSnapshot = typeof MatteBoardSnapshot.Type;
export const MatteBoardRead = Schema.Struct({ projectId: ProjectId });
export const MatteBoardWrite = Schema.Struct({
  ...MatteBoardRead.fields,
  revision: NonNegativeInt,
  board: MatteBoard,
});
export type MatteBoardWrite = typeof MatteBoardWrite.Type;
export const emptyMatteBoard: MatteBoard = {
  roadmap: "",
  context: "",
  tasks: [],
  projectThreadId: null,
};
