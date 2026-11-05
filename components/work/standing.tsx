import { ClipboardList } from "lucide-react";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import type { Standing } from "@/lib/work/standing";

/**
 * The client's master instructions (their factory's standing requirements,
 * 0062) and any diamond certificate, at the top of every order for the
 * designer and the pod lead. Nothing when the client has given neither.
 */
export function StandingInstructions({ standing, footer }: { standing: Standing; footer?: React.ReactNode }) {
  const { master, certificates } = standing;
  if (!master && certificates.length === 0 && !footer) return null;
  return (
    <Card as="section" aria-labelledby="standing-title" className="border-[color:var(--border-strong)]">
      <CardHeader>
        <CardTitle id="standing-title" className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden />
          Master instructions
        </CardTitle>
        <span className="text-[length:var(--fs-2)] text-muted-foreground">Follow on every order</span>
      </CardHeader>
      <CardBody className="space-y-4">
        {master ? (
          <p className="whitespace-pre-line text-[length:var(--fs-3)]">{master.body}</p>
        ) : (
          <p className="text-[length:var(--fs-2)] text-muted-foreground">None from this client.</p>
        )}
        {certificates.length > 0 && (
          <div>
            <p className="text-[length:var(--fs-2)] font-medium">Diamond certificate</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {certificates.map((c, i) => (
                <li key={c.id}>
                  <a href={c.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[var(--r-sm)] border border-border bg-subtle">
                    {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                    <img src={c.url} alt={`Diamond certificate ${i + 1}`} className="h-24 w-24 object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {footer}
      </CardBody>
    </Card>
  );
}
