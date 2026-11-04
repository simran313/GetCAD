"use client";

import { useRouter } from "next/navigation";

/**
 * A form whose server action is followed by a refresh of the open page, as
 * the other admin controls do (LeadControls): the page then shows what was
 * just saved, whatever its address (the "Show in full" view included).
 */
export function RefreshForm({
  action,
  children,
  className,
}: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <form
      className={className}
      action={async (formData) => {
        await action(formData);
        router.refresh();
      }}
    >
      {children}
    </form>
  );
}
