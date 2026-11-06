import { WS_METHODS, ORCHESTRATION_V2_WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { connectionAtomRuntime } from "../connection/runtime";

export const readBoard = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "matteos:board",
  tag: WS_METHODS.matteBoardRead,
  staleTimeMs: 0,
  refreshIntervalMs: 10000,
});
export const saveBoard = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "matteos:save",
  tag: WS_METHODS.matteBoardWrite,
  onSettled: ({ environmentId, input }, registry) => {
    registry.refresh(readBoard({ environmentId, input: { projectId: input.projectId } }));
    return Effect.void;
  },
});
export const launchChat = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "matteos:open-chat",
  tag: ORCHESTRATION_V2_WS_METHODS.launchThread,
});
import * as Effect from "effect/Effect";
