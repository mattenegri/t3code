import { createFileRoute } from "@tanstack/react-router";
import { MatteWorkspace } from "../matteos/Workspace";
export const Route = createFileRoute("/_chat/tasks")({
  validateSearch: (value: Record<string, unknown>) => ({
    project: typeof value.project === "string" ? value.project : undefined,
    env: typeof value.env === "string" ? value.env : undefined,
  }),
  component: TasksRoute,
});
function TasksRoute() {
  const { project, env } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <MatteWorkspace
      projectId={project}
      environmentId={env}
      chooseProject={(environmentId, projectId) =>
        void navigate({ search: { env: environmentId, project: projectId } })
      }
    />
  );
}
