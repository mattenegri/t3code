import { useComposerDraftStore } from "../composerDraftStore";
import { createMemoryHistory } from "@tanstack/react-router";
import {
  type MatteBoardSnapshot,
  type MatteBoardWrite,
  emptyMatteBoard,
  WS_METHODS,
  ORCHESTRATION_V2_WS_METHODS,
  type OrchestrationV2ThreadLaunchInput,
  type ThreadId,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import "~/index.css";
import { ProjectNoteEditor } from "./Board";
import { AppRoot } from "~/AppRoot";
import { getRouter } from "~/router";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import {
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
} from "../../test/fakeEnvironment";
import { render } from "../../test/render";

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
      context: "Rispettare i dati locali",
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
  using _fixture = installFakeEnvironment([roadmap, first], {
    [ORCHESTRATION_V2_WS_METHODS.launchThread]: (input: OrchestrationV2ThreadLaunchInput) => {
      launch = input;
      return Effect.never;
    },
    [WS_METHODS.matteBoardRead]: () => Effect.succeed(saved),
    [WS_METHODS.matteBoardWrite]: (input: MatteBoardWrite) => {
      saved = {
        revision: input.revision + 1,
        board: input.board,
        pendingThreadIds: input.board.tasks.flatMap((t) =>
          t.threadIds.filter((id) => id !== first.id),
        ),
      };
      return Effect.succeed(saved);
    },
    [WS_METHODS.matteTaskLink]: ({ threadId }: { threadId: ThreadId }) => {
      const linked = saved.board.tasks.find((t) => t.threadIds.includes(threadId));
      return Effect.succeed(linked ? { id: linked.id, title: linked.title } : null);
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
  await button("Contesto").click();
  const projectContext = page.getByRole("textbox", { name: "Contesto del progetto" });
  await expect.element(projectContext).toHaveValue("Rispettare i dati locali");
  const input = document.querySelector<HTMLInputElement>('input[aria-label="File di contesto"]')!;
  await userEvent.upload(
    input,
    new File(["Usare worktree separati"], "decisioni.md", { type: "text/markdown" }),
  );
  const combined = "Rispettare i dati locali\n\nUsare worktree separati";
  await expect.element(projectContext).toHaveValue(combined);
  await button("Roadmap").click();
  await expect
    .element(page.getByRole("textbox", { name: "Roadmap" }))
    .toHaveValue("Preparare il primo rilascio");
  await button("Contesto").click();
  await expect.element(projectContext).toHaveValue(combined);
  expect(saved.board.context).toBe("Rispettare i dati locali");
  await button("Salva").click();
  await vi.waitFor(() => expect(saved.board.context).toBe(combined));
  expect(saved.board.roadmap).toBe("Preparare il primo rilascio");
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
  await button("Nuovo task").click();
  await page.getByRole("textbox", { name: "Titolo del task" }).fill("Verifica colori");
  await page
    .getByRole("textbox", { name: "Descrizione" })
    .fill("Verificare il contrasto dei pulsanti.");
  await button("Crea task").click();
  await expect.element(page.getByRole("heading", { name: "Verifica colori" })).toBeVisible();
  await expect
    .element(page.getByText("Verificare il contrasto dei pulsanti.", { exact: true }))
    .toBeVisible();
  await button("Nuova conversazione").click();
  await expect.element(page.getByTestId("composer-editor")).toBeVisible();
  const newTask = saved.board.tasks.find((t) => t.title === "Verifica colori")!;
  const firstDraft = useComposerDraftStore
    .getState()
    .getDraftSessionByRef({ environmentId: ENVIRONMENT_ID, threadId: newTask.threadIds[0]! });
  expect(firstDraft).toMatchObject({ envMode: "worktree", worktreePath: null, branch: "HEAD" });
  await expect.element(page.getByRole("heading", { name: newTask.title })).toBeVisible();
  router.history.back();
  await expect.element(button("Nuova conversazione")).toBeDisabled();
  await button("Tutti i task").click();
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
  await page.getByRole("link", { name: "Analisi del task" }).click();
  await expect
    .element(page.getByText("Answer 0 for task-analysis.", { exact: false }))
    .toBeVisible();
  await expect.element(page.getByTestId("composer-editor")).toBeVisible();
  const toggleDetails = button("Toggle thread details panel");
  const backlink = page.getByRole("link", { name: "Task · Ricerca nella lista" });
  if (toggleDetails.query()?.getAttribute("aria-pressed") === "false") await toggleDetails.click();
  await backlink.click();
  await expect.element(page.getByRole("heading", { name: task.title })).toBeVisible();
  await button("Nuova conversazione").click();
  await expect.element(page.getByTestId("composer-editor")).toBeVisible();
  await vi.waitFor(() => expect(router.state.location.pathname).toMatch(/^\/draft\//));
  const id = saved.board.tasks[0]!.threadIds.at(-1)!;
  expect(id).not.toBe(first.id);
  const draft = useComposerDraftStore.getState().getDraftSessionByRef({
    environmentId: ENVIRONMENT_ID,
    threadId: id,
  });
  expect(draft).toMatchObject({ worktreePath: first.worktreePath, branch: first.branch });
  await page.getByTestId("composer-editor").fill("Implementa la ricerca");
  router.history.back();
  await expect.element(page.getByRole("heading", { name: task.title })).toBeVisible();
  await page.getByRole("button", { name: /Conversazione 2.*Bozza/ }).click();
  await expect
    .element(page.getByTestId("composer-editor"))
    .toHaveTextContent("Implementa la ricerca");
  await page.getByTestId("composer-editor").click();
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() =>
    expect(launch).toMatchObject({
      threadId: id,
      initialMessage: { text: "Implementa la ricerca" },
      workspaceStrategy: {
        type: "existing_worktree",
        worktreePath: first.worktreePath,
        branch: first.branch,
      },
    }),
  );
});

it("preserves a roadmap draft across unrelated revisions and resolves overlapping edits", async () => {
  const initial = { ...emptyMatteBoard, roadmap: "Prima bozza", context: "Contesto iniziale" };
  const save = vi.fn(async () => true);
  const props = { close: () => {}, save, disabled: false, field: "roadmap" as const, active: true };
  await using screen = await render(<ProjectNoteEditor {...props} board={initial} revision={1} />);
  const roadmap = page.getByRole("textbox", { name: "Roadmap" });
  await roadmap.fill("La mia proposta");
  const latest = { ...initial, context: "Nuovo contesto" };
  await screen.rerender(<ProjectNoteEditor {...props} board={latest} revision={2} />);
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  expect(save.mock.calls[0]).toEqual([{ ...latest, roadmap: "La mia proposta" }, 2]);
  await roadmap.fill("La mia proposta");
  const remote = { ...latest, roadmap: "Proposta di un collega" };
  await screen.rerender(<ProjectNoteEditor {...props} board={remote} revision={3} />);
  await expect.element(page.getByRole("button", { name: "Salva", exact: true })).toBeDisabled();
  await expect.element(roadmap).toHaveValue("La mia proposta");
  await page.getByRole("button", { name: "Mantieni la mia modifica" }).click();
  await page.getByRole("button", { name: "Salva", exact: true }).click();
  expect(save.mock.calls[1]).toEqual([{ ...remote, roadmap: "La mia proposta" }, 3]);
});
