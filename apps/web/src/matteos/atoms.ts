import {
  WS_METHODS,
  ORCHESTRATION_V2_WS_METHODS,
  type MatteBoardSnapshot,
} from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../connection/runtime";

import { scopedProjectKey } from "@t3tools/client-runtime/environment";
import { Atom } from "effect/reactivity";
import * as Effect from "effect/Effect";

export const lastBoardWrite = Atom.family((_projectKey: string) =>
  Atom.make<MatteBoardSnapshot | null>(null).pipe(Atom.setIdleTTL(300000)),
);
export const readTaskLink = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "matteos:task-link",
  tag: WS_METHODS.matteTaskLink,
  refreshTrigger: ({ environmentId, input }) =>
    lastBoardWrite(scopedProjectKey({ environmentId, projectId: input.projectId })),
  staleTimeMs: 0,
});
export const readBoard = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "matteos:board",
  tag: WS_METHODS.matteBoardRead,
  staleTimeMs: 0,
  refreshIntervalMs: 10000,
});
export const saveBoard = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "matteos:save",
  tag: WS_METHODS.matteBoardWrite,
  onSuccess: ({ environmentId, input }, registry, result) =>
    Effect.sync(() => {
      registry.set(
        lastBoardWrite(scopedProjectKey({ environmentId, projectId: input.projectId })),
        result,
      );
    }),
  onSettled: ({ environmentId, input }, registry) => {
    registry.refresh(readBoard({ environmentId, input: { projectId: input.projectId } }));
    return Effect.void;
  },
});
export const launchChat = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "matteos:open-chat",
  tag: ORCHESTRATION_V2_WS_METHODS.launchThread,
});
