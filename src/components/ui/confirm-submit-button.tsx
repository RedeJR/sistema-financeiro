"use client";

import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmMessage: string;
};

// Botão de submit que pede confirmação antes de disparar a Server Action do
// <form> pai (usado pra excluir registros).
export function ConfirmSubmitButton({
  confirmMessage,
  onClick,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type="submit"
      className={
        className ??
        "rounded-md px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
      }
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
