import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function Campo({ label, id, className, ...rest }: Props) {
  const inputId = id ?? rest.name;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-foreground/80">
        {label}
      </label>
      <input
        id={inputId}
        className={
          className ??
          "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/40 dark:border-white/20"
        }
        {...rest}
      />
    </div>
  );
}
