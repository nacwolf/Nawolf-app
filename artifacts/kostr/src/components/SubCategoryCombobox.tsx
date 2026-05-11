import { useState } from "react";
import { Check, ChevronsUpDown, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SubCategoryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}

export function SubCategoryCombobox({
  value,
  onChange,
  options,
  placeholder = "e.g. chips, sauce mix",
}: SubCategoryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const normalizedSearch = search.trim().toLowerCase();
  const exactMatch = options.some(o => o.toLowerCase() === normalizedSearch);
  const showCreate = normalizedSearch.length > 0 && !exactMatch;

  function handleSelect(selected: string) {
    onChange(selected === value ? "" : selected);
    setOpen(false);
    setSearch("");
  }

  function handleCreate() {
    if (search.trim()) {
      onChange(search.trim());
      setOpen(false);
      setSearch("");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9 px-3"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search or type new..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {showCreate && (
              <CommandGroup>
                <CommandItem
                  value={`__create__${search}`}
                  onSelect={handleCreate}
                  className="gap-2"
                >
                  <PlusCircle className="h-4 w-4 text-muted-foreground" />
                  <span>
                    Create: <span className="font-medium">{search.trim()}</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            {options.length > 0 && (
              <CommandGroup heading={options.length > 0 ? "Existing" : undefined}>
                {options.map(opt => (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={() => handleSelect(opt)}
                    className="gap-2"
                  >
                    <Check
                      className={cn(
                        "h-4 w-4",
                        value === opt ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {opt}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!showCreate && options.length === 0 && (
              <CommandEmpty>No sub-categories yet. Type to create one.</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
