import { Link } from "@tanstack/react-router";
import type { ScopedProjectRef } from "@t3tools/contracts";
import { Columns3Icon } from "lucide-react";
export function MatteSidebarLink({ project }: { project: ScopedProjectRef | null | undefined }) {
  return (
    <Link
      to="/tasks"
      search={{ env: project?.environmentId, project: project?.projectId }}
      className="mb-1 flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-row-hover"
      activeProps={{ className: "bg-sidebar-accent" }}
    >
      <Columns3Icon className="size-4" />
      Task
    </Link>
  );
}
