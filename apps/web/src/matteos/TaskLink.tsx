import { Link } from "@tanstack/react-router";
import { ListTodoIcon } from "lucide-react";
import {
  AuthOrchestrationReadScope,
  type EnvironmentId,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import { useEnvironmentQuery } from "../state/query";
import { useEnvironmentScope } from "../state/session";
import { ThreadDetailsControl } from "../components/chat/ThreadDetailsControl";
import { ThreadDetailsSection } from "../components/chat/ThreadDetailsSection";
import { readTaskLink } from "./atoms";

type TaskLinkProps = { environmentId: EnvironmentId; projectId: ProjectId; threadId: ThreadId };
function useLinkedTask({ environmentId, projectId, threadId }: TaskLinkProps) {
  const allowed = useEnvironmentScope(environmentId, AuthOrchestrationReadScope);
  const { data } = useEnvironmentQuery(
    allowed ? readTaskLink({ environmentId, input: { projectId, threadId } }) : null,
  );
  return data;
}

export function TaskDraftHeading(props: TaskLinkProps) {
  const data = useLinkedTask(props);
  return (
    <div className="mx-auto max-w-xl text-center">
      <p className="text-xs text-muted-foreground">Conversazione del task</p>
      <h1 className="mt-1 break-words text-2xl font-medium tracking-tight">
        {data?.title ?? "Nuova conversazione"}
      </h1>
    </div>
  );
}

export function TaskLink(props: TaskLinkProps) {
  const { environmentId, projectId } = props;
  const data = useLinkedTask(props);
  if (!data) return null;
  return (
    <ThreadDetailsSection
      headingId="matteos-linked-task"
      title="Task"
      separated={false}
      showHeading={false}
    >
      <div>
        <ThreadDetailsControl
          render={
            <Link to="/tasks" search={{ env: environmentId, project: projectId, task: data.id }} />
          }
          title={data.title}
        >
          <ListTodoIcon />
          <span className="truncate">Task · {data.title}</span>
        </ThreadDetailsControl>
      </div>
    </ThreadDetailsSection>
  );
}
