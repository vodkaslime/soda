import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export type SelectOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  triggerClassName?: string;
  icon?: ReactNode;
  disabled?: boolean;
};

export default function Select({
  value,
  onChange,
  options,
  placeholder,
  className = "",
  contentClassName = "",
  triggerClassName = "",
  icon,
  disabled = false,
}: SelectProps) {
  const activeOption = options.find((option) => option.value === value);
  const triggerLabel = activeOption?.label ?? placeholder ?? "Select";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className={[
            "flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-left text-sm text-text-primary shadow-sm outline-none transition hover:border-coral/30 hover:bg-surface-hover focus:ring-2 focus:ring-coral/15 disabled:cursor-not-allowed disabled:opacity-60",
            triggerClassName,
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="min-w-0 truncate">{triggerLabel}</span>
          <span className="shrink-0 text-text-muted">{icon ?? <ChevronDown className="h-4 w-4" aria-hidden="true" />}</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className={[
            "z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.18)]",
            contentClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {options.map((option) => {
            const isActive = option.value === value;
            return (
              <DropdownMenu.Item
                key={option.value}
                disabled={option.disabled}
                onSelect={() => {
                  if (!option.disabled) {
                    onChange(option.value);
                  }
                }}
                className={[
                  "flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm outline-none transition",
                  option.disabled
                    ? "cursor-not-allowed opacity-50"
                    : isActive
                      ? "bg-coral/10 text-coral"
                      : "text-text-primary hover:bg-background focus:bg-background",
                ].join(" ")}
              >
                <span className="truncate">{option.label}</span>
                {isActive ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
