import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "../components/ui/select";
import { GitBranchIcon, FolderGit2Icon } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../components/ui/tooltip";
import { Popover, PopoverPopup, PopoverTrigger } from "../components/ui/popover";
import { Button } from "../components/ui/button";
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
  compact = false,
}: {
  label: string;
  value: string;
  items: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
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
      <SelectTrigger
        className="min-w-0"
        aria-label={label}
        variant={compact ? "ghost" : "default"}
        size={compact ? "compact" : "sm"}
      >
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
export function WorkspaceLabel({
  branch,
  path,
  interactive = false,
}: {
  branch: string | null;
  path: string | null;
  interactive?: boolean;
}) {
  const label = (
    <>
      <FolderGit2Icon aria-hidden className="size-3" />
      Worktree
    </>
  );
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex min-w-0 items-center gap-1">
        <GitBranchIcon aria-hidden className="size-3 shrink-0" />
        <span className="truncate">{branch ?? "Da assegnare"}</span>
      </span>
      {path &&
        (interactive ? (
          <Popover>
            <PopoverTrigger
              render={<Button variant="ghost-muted" size="xs" />}
              aria-label="Mostra percorso del worktree"
              title={path}
            >
              {label}
            </PopoverTrigger>
            <PopoverPopup aria-label="Percorso del worktree" padding="compact" align="start">
              <code className="block max-w-[min(24rem,80vw)] break-all text-xs">{path}</code>
            </PopoverPopup>
          </Popover>
        ) : (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex shrink-0 items-center gap-1" />}>
              {label}
            </TooltipTrigger>
            <TooltipPopup>{path}</TooltipPopup>
          </Tooltip>
        ))}
    </span>
  );
}
