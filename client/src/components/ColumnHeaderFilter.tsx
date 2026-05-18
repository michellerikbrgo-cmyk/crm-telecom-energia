import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Filter } from "lucide-react";

export type ColumnSort = "asc" | "desc" | null;

type Props = {
  label: string;
  textFilter?: string;
  onTextFilter?: (v: string) => void;
  textPlaceholder?: string;
  selectFilter?: string;
  onSelectFilter?: (v: string) => void;
  selectOptions?: { value: string; label: string }[];
  sort?: ColumnSort;
  onSort?: (s: ColumnSort) => void;
  active?: boolean;
};

export function ColumnHeaderFilter({
  label,
  textFilter,
  onTextFilter,
  textPlaceholder,
  selectFilter,
  onSelectFilter,
  selectOptions,
  sort,
  onSort,
  active,
}: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 font-medium hover:text-foreground",
            active && "text-primary",
          )}
        >
          {label}
          <Filter className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 space-y-3" align="start">
        {onTextFilter ? (
          <Input
            className="h-8 text-xs"
            placeholder={textPlaceholder || "Filtrar…"}
            value={textFilter ?? ""}
            onChange={(e) => onTextFilter(e.target.value)}
          />
        ) : null}
        {onSelectFilter && selectOptions ? (
          <Select value={selectFilter ?? "__all"} onValueChange={onSelectFilter}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {onSort ? (
          <div className="flex gap-1">
            <Button
              type="button"
              variant={sort === "asc" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => onSort(sort === "asc" ? null : "asc")}
            >
              <ArrowUp className="h-3 w-3 mr-1" />
              A–Z
            </Button>
            <Button
              type="button"
              variant={sort === "desc" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => onSort(sort === "desc" ? null : "desc")}
            >
              <ArrowDown className="h-3 w-3 mr-1" />
              Z–A
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
