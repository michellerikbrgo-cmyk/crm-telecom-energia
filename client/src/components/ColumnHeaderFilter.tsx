import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
export type DateFilterMode = "day" | "month";

type CheckboxOption = { value: string; label: string };

type Props = {
  label: string;
  textFilter?: string;
  onTextFilter?: (v: string) => void;
  textPlaceholder?: string;
  selectFilter?: string;
  onSelectFilter?: (v: string) => void;
  selectOptions?: { value: string; label: string }[];
  checkboxFilter?: {
    selected: string[];
    options: CheckboxOption[];
    onChange: (selected: string[]) => void;
  };
  dateFilter?: {
    mode: DateFilterMode;
    dayValue: string;
    monthValue: string;
    onModeChange: (mode: DateFilterMode) => void;
    onDayChange: (v: string) => void;
    onMonthChange: (v: string) => void;
  };
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
  checkboxFilter,
  dateFilter,
  sort,
  onSort,
  active,
}: Props) {
  const toggleCheckbox = (value: string, checked: boolean) => {
    if (!checkboxFilter) return;
    const set = new Set(checkboxFilter.selected);
    if (checked) set.add(value);
    else set.delete(value);
    checkboxFilter.onChange(Array.from(set));
  };

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
      <PopoverContent className="w-60 p-3 space-y-3" align="start">
        {onTextFilter ? (
          <Input
            className="h-8 text-xs"
            placeholder={textPlaceholder || "Filtrar…"}
            value={textFilter ?? ""}
            onChange={(e) => onTextFilter(e.target.value)}
          />
        ) : null}
        {dateFilter ? (
          <div className="space-y-2">
            <Select value={dateFilter.mode} onValueChange={(v) => dateFilter.onModeChange(v as DateFilterMode)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Dia exacto</SelectItem>
                <SelectItem value="month">Mês</SelectItem>
              </SelectContent>
            </Select>
            {dateFilter.mode === "day" ? (
              <Input
                type="date"
                className="h-8 text-xs"
                value={dateFilter.dayValue}
                onChange={(e) => dateFilter.onDayChange(e.target.value)}
              />
            ) : (
              <Input
                type="month"
                className="h-8 text-xs"
                value={dateFilter.monthValue}
                onChange={(e) => dateFilter.onMonthChange(e.target.value)}
              />
            )}
            {(dateFilter.dayValue || dateFilter.monthValue) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-full text-xs"
                onClick={() => {
                  dateFilter.onDayChange("");
                  dateFilter.onMonthChange("");
                }}
              >
                Limpar data
              </Button>
            )}
          </div>
        ) : null}
        {checkboxFilter ? (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {checkboxFilter.options.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={checkboxFilter.selected.includes(o.value)}
                  onCheckedChange={(v) => toggleCheckbox(o.value, v === true)}
                />
                {o.label}
              </label>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs"
              onClick={() => checkboxFilter.onChange(checkboxFilter.options.map((o) => o.value))}
            >
              Seleccionar todos
            </Button>
          </div>
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

/** Compara data de linha com filtro dia (YYYY-MM-DD) ou mês (YYYY-MM). */
export function matchDateColumnFilter(
  raw: Date | string | null | undefined,
  mode: DateFilterMode,
  dayValue: string,
  monthValue: string,
): boolean {
  if (!dayValue.trim() && !monthValue.trim()) return true;
  if (raw == null) return false;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  if (mode === "day" && dayValue.trim()) {
    const want = dayValue.trim();
    const iso = d.toISOString().slice(0, 10);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return iso === want || local === want;
  }
  if (mode === "month" && monthValue.trim()) {
    const want = monthValue.trim();
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return ym === want;
  }
  return true;
}
