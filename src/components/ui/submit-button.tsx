"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel?: string;
};

export function SubmitButton({
  children,
  pendingLabel = "Salvando...",
  className,
  ...rest
}: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={
        className ??
        "rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
      }
      {...rest}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
