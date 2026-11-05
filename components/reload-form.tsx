"use client";

/**
 * A form whose server action is followed by a full reload of the page.
 *
 * Why a reload: in CI the save was stored but, on some runs, the page kept
 * showing the old state until reloaded; the action's answer carried the
 * revalidation flag and the router did not re-read the page (e2e log,
 * 4 Nov 2026). A reload always shows what is in the database, and here it
 * also hides the full bank details again after every change. A refused save
 * throws before the reload, to the page's error screen, as before.
 */
export function ReloadForm({
  action,
  children,
  className,
}: {
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form
      className={className}
      action={async (formData) => {
        await action(formData);
        window.location.reload();
      }}
    >
      {children}
    </form>
  );
}
