"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ButtonLoadingContent } from "@/components/loading-indicator";

type PendingSubmitButtonProps = {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  pendingLabel: string;
};

export function PendingSubmitButton({
  children,
  className,
  disabled = false,
  pendingLabel
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      aria-busy={pending}
    >
      {pending ? <ButtonLoadingContent label={pendingLabel}>{children}</ButtonLoadingContent> : children}
    </button>
  );
}
