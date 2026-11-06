import { createMemoryHistory } from "@tanstack/react-router";
import {
  type MatteBoardSnapshot,
  type MatteBoardWrite,
  emptyMatteBoard,
  WS_METHODS,
  ORCHESTRATION_V2_WS_METHODS,
  type OrchestrationV2ThreadLaunchInput,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import "~/index.css";
import { RoadmapEditor } from "./Board";
import { AppRoot } from "~/AppRoot";
import { getRouter } from "~/router";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import {
  installFakeEnvironment,
  projectionOf,
  threadWithHistory,
  type FakeDriver,
} from "../../test/fakeEnvironment";
import { act, render } from "../../test/render";

vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (original) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    original<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
});

it("switches views, retains task conversations and launches another in the same worktree", async () => {
  await page.viewport(1440, 900);
  const history = threadWithHistory("roadmap", 1);
  const roadmap = {
    ...history,
    title: "Roadmap",
    items: history.items.map((i) =>
      i.type === "user_message"
        ? { ...i, text: "Quale task posso affrontare per primo?" }
        : i.type === "assistant_message"
          ? {
              ...i,
              text: "Completa la ricerca nella lista prima di rivedere i colori. I criteri del filtro sono già definiti nel task.",
            }
          : i,
    ),
  };
  const first = {
    ...threadWithHistory("task-analysis", 1),
    title: "Analisi del task",
    branch: "feat/ricerca",
    worktreePath: "/worktrees/ricerca",
  };
  const task = {
    id: "screen-test",
    title: "Ricerca nella lista",
    notes: "Mantieni i filtri attivi",
    status: "doing" as const,
    workspace: "worktree" as const,
    branch: "feat/ricerca",
    worktreePath: "/worktrees/ricerca",
    threadIds: [first.id],
  };
  let saved: MatteBoardSnapshot = {
    revision: 1,
    board: {
      ...emptyMatteBoard,
      roadmap: "Preparare il primo rilascio",
      projectThreadId: roadmap.id,
      tasks: [
        task,
        {
          ...task,
          id: "access",
          title: "Navigazione da tastiera",
          status: "todo",
          branch: null,
          worktreePath: null,
          threadIds: [],
        },
        {
          ...task,
          id: "setup",
          title: "Aprire il primo progetto",
          status: "done",
          branch: "feat/progetto",
          worktreePath: null,
          threadIds: [],
        },
      ],
    },
  };
  let launch: OrchestrationV2ThreadLaunchInput | undefined;
  let finishLaunch!: () => void;
  const response = new Promise<void>((resolve) => {
    finishLaunch = resolve;
  });
  using _fixture = installFakeEnvironment([roadmap, first], {
    [WS_METHODS.matteBoardRead]: () => Effect.succeed(saved),
    [WS_METHODS.matteBoardWrite]: (input: MatteBoardWrite) => {
      saved = { revision: input.revision + 1, board: input.board };
      return Effect.succeed(saved);
    },
    [ORCHESTRATION_V2_WS_METHODS.launchThread]: (input: OrchestrationV2ThreadLaunchInput) => {
      launch = input;
      return Effect.promise(async () => {
        await response;
        const thread = threadWithHistory(String(input.threadId), 1);
        return { threadId: thread.id, resumed: false, projection: projectionOf(thread) };
      });
    },
  });
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const router = getRouter(createMemoryHistory({ initialEntries: ["/tasks"] }));
  await router.load();
  await using _screen = await render(<AppRoot router={router} />, { router: false }); // AppRoot supplies the product router.
  await expect.element(page.getByRole("heading", { name: "Chat di progetto" })).toBeVisible();
  await expect
    .element(page.getByText("Completa la ricerca nella lista", { exact: false }))
    .toBeVisible();
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const sidebarToggle = button("Toggle main sidebar");
  const composer = page.getByTestId("composer-editor");
  await composer.fill("Confronta le priorità");
  await button("Nascondi chat").click();
  await expect
    .element(page.getByRole("complementary", { name: "Conversazione" }))
    .not.toBeInTheDocument();
  await sidebarToggle.click();
  await expect.element(sidebarToggle).toHaveAttribute("aria-pressed", "false");
  await button("Mostra chat").click();
  await expect.element(page.getByRole("heading", { name: "Chat di progetto" })).toBeVisible();
  await expect.element(sidebarToggle).toHaveAttribute("aria-pressed", "false");
  await expect.element(composer).toHaveTextContent("Confronta le priorità");
  await sidebarToggle.click();
  await page.getByRole("textbox", { name: "Nome del nuovo task" }).fill("Verifica colori");
  await page.getByRole("button", { name: "Aggiungi task", exact: true }).click();
  await expect.element(page.getByRole("button", { name: /Verifica colori/ })).toBeVisible();
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await expect.element(page.getByRole("button", { name: /Ricerca nella lista/ })).toBeVisible();
  await page.viewport(1200, 850);
  await expect.element(button("Mostra chat")).toBeVisible();
  await sidebarToggle.click();
  await expect.element(button("Nascondi chat")).toBeVisible();
  await sidebarToggle.click();
  await page.viewport(390, 844);
  await button("Mostra chat").click();
  await expect.element(page.getByRole("heading", { name: "Chat di progetto" })).toBeVisible();
  await button("Torna ai task").click();
  await sidebarToggle.click();
  await page.getByRole("link", { name: "Task", exact: true }).click();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await page.viewport(1440, 900);
  await button("Nascondi chat").click();
  await page.getByRole("button", { name: "Kanban", exact: true }).click();
  await page.getByRole("button", { name: /Ricerca nella lista/ }).click();
  await page.getByRole("button", { name: "Mostra percorso del worktree" }).click();
  await expect.element(page.getByText("/worktrees/ricerca", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mostra percorso del worktree" }).click();
  await page.getByRole("button", { name: "Analisi del task" }).click();
  await expect
    .element(page.getByText("Answer 0 for task-analysis.", { exact: false }))
    .toBeVisible();
  await page.getByRole("button", { name: "Nuova conversazione", exact: true }).click();
  await page.getByRole("textbox", { name: "Messaggio", exact: true }).fill("Implementa la ricerca");
  await button("Chat di progetto").click();
  await expect.element(page.getByRole("heading", { name: "Chat di progetto" })).toBeVisible();
  await button("Nuova conversazione").click();
  await expect
    .element(page.getByRole("textbox", { name: "Messaggio", exact: true }))
    .toHaveValue("Implementa la ricerca");
  await button("Nascondi chat").click();
  await expect.element(page.getByRole("heading", { name: "Ricerca nella lista" })).toBeVisible();
  await button("Mostra chat").click();
  await expect
    .element(page.getByRole("textbox", { name: "Messaggio", exact: true }))
    .toHaveValue("Implementa la ricerca");
  await page.getByRole("button", { name: "Invia messaggio", exact: true }).click();
  await vi.waitFor(() =>
    expect(launch?.workspaceStrategy).toEqual({
      type: "existing_worktree",
      worktreePath: "/worktrees/ricerca",
      branch: "feat/ricerca",
    }),
  );
  expect(launch?.title).toBe("Implementa la ricerca");
  expect(saved.board.tasks[0]?.threadIds).toContain(launch?.threadId);
  await button("Analisi del task").click();
  await expect
    .element(page.getByText("Answer 0 for task-analysis.", { exact: false }))
    .toBeVisible();
  await act(async () => {
    finishLaunch();
    await response;
  });
  await expect
    .element(page.getByText("Answer 0 for task-analysis.", { exact: false }))
    .toBeVisible();
  await expect
    .element(page.getByRole("link", { name: "Apri conversazione in T3" }))
    .toHaveAttribute("href", expect.stringContaining(String(first.id)));
});

it("preserves a roadmap draft across unrelated revisions and resolves overlapping edits", async () => {
  const initial = { ...emptyMatteBoard, roadmap: "Prima bozza", context: "Contesto iniziale" };
  const save = vi.fn(async () => true);
  const props = { close: () => {}, save, disabled: false };
  await using screen = await render(<RoadmapEditor {...props} board={initial} revision={1} />);
  const roadmap = page.getByRole("textbox", { name: "Roadmap" });
  await roadmap.fill("La mia proposta");
  const latest = { ...initial, context: "Nuovo contesto" };
  await screen.rerender(<RoadmapEditor {...props} board={latest} revision={2} />);
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  expect(save.mock.calls[0]).toEqual([{ ...latest, roadmap: "La mia proposta" }, 2]);
  const remote = { ...latest, roadmap: "Proposta di un collega" };
  await screen.rerender(<RoadmapEditor {...props} board={remote} revision={3} />);
  await expect.element(page.getByRole("button", { name: "Salva", exact: true })).toBeDisabled();
  await expect.element(roadmap).toHaveValue("La mia proposta");
  await page.getByRole("button", { name: "Mantieni la mia modifica" }).click();
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  expect(save.mock.calls[1]).toEqual([{ ...remote, roadmap: "La mia proposta" }, 3]);
});
