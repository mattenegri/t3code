import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "../components/ui/select";
import { GitBranchIcon, FolderGit2Icon } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../components/ui/tooltip";
import type { MatteTaskStatus } from "@t3tools/contracts";

export const stages: ReadonlyArray<{ value: MatteTaskStatus; label: string; dot: string }> = [
  { value: "todo", label: "Da fare", dot: "bg-muted-foreground" },
  { value: "doing", label: "In corso", dot: "bg-info" },
  { value: "review", label: "In revisione", dot: "bg-warning" },
  { value: "done", label: "Conclusi", dot: "bg-success" },
];
export function Choice({
  label,
  value,
  items,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  items: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      items={items}
      disabled={disabled}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
    >
      <SelectTrigger className="min-w-0" aria-label={label} size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
export function WorkspaceLabel({ branch, path }: { branch: string | null; path: string | null }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1">
        <GitBranchIcon aria-hidden className="size-3 shrink-0" />
        <span className="truncate">{branch ?? "Da assegnare"}</span>
      </span>
      {path && (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex shrink-0 items-center gap-1" />}>
            <FolderGit2Icon aria-hidden className="size-3" />
            Worktree
          </TooltipTrigger>
          <TooltipPopup>{path}</TooltipPopup>
        </Tooltip>
      )}
    </span>
  );
}
