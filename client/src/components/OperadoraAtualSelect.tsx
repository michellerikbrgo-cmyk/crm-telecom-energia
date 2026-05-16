import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OPERADORA_ATUAL_OPTIONS } from "@shared/operadoraAtual";

type Props = {
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  allowEmpty?: boolean;
};

export function OperadoraAtualSelect({
  value,
  onValueChange,
  className,
  placeholder = "Seleccionar operadora",
  allowEmpty = true,
}: Props) {
  const selectValue = value || (allowEmpty ? "__none" : undefined);
  return (
    <Select
      value={selectValue}
      onValueChange={(v) => onValueChange(v === "__none" ? "" : v)}
    >
      <SelectTrigger className={className ?? "h-9"}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty ? <SelectItem value="__none">—</SelectItem> : null}
        {OPERADORA_ATUAL_OPTIONS.map((op) => (
          <SelectItem key={op} value={op}>
            {op}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
