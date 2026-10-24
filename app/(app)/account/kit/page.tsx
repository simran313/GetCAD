import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/category-badge";
import { CheckBox, ChecklistRow } from "@/components/ui/checklist-row";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListRow } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { Pills } from "@/components/ui/pills";
import { StatusTag } from "@/components/ui/status-tag";
import { Timer } from "@/components/ui/timer";
import { UploadSlot } from "@/components/ui/upload-slot";

/**
 * The shared building blocks of Phase 5 (docs/design README), on one page, so
 * the look can be checked on a real phone before the screens are rebuilt with
 * them. Signed-in users only; it shows sample values, never real data.
 */
export const dynamic = "force-dynamic";

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

export default async function DesignKitPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <main className="container max-w-4xl space-y-6 py-8">
      <PageHeader
        eyebrow="Phase 5 · design kit"
        title="Building blocks"
        description="Every shared piece the new screens are made of, with sample values."
        actions={
          <>
            <Button variant="outline">Secondary</Button>
            <Button>Primary action</Button>
          </>
        }
      />

      <Card as="section">
        <CardHeader>
          <CardTitle>Status tags</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-wrap items-center gap-3">
          <StatusTag kind="needs">Needs you</StatusTag>
          <StatusTag kind="active">In design</StatusTag>
          <StatusTag kind="done">Completed</StatusTag>
          <StatusTag kind="muted">Cancelled</StatusTag>
          <StatusBadge status="CLIENT_PREVIEW" />
          <StatusBadge status="QC_REVIEW" />
          <StatusBadge status="DELIVERED" />
          <CategoryBadge letter="C" />
          <Timer dueAt={inHours(5.7)} label="First look" />
          <Timer dueAt={inHours(0.5)} label="Designer due" />
        </CardBody>
      </Card>

      <Card as="section">
        <CardHeader>
          <CardTitle>Fields and choices</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <Field label="Reference name" htmlFor="kit-ref" hint="Only you see this.">
            <Input id="kit-ref" defaultValue="Halo ring for Mrs Shah" />
          </Field>
          <Field label="Ring size" htmlFor="kit-size" error="Give a ring size or a circumference.">
            <Input id="kit-size" />
          </Field>
          <Pills
            name="kit-product"
            legend="Product"
            defaultValue="RING"
            options={[
              { value: "RING", label: "Ring" },
              { value: "PENDANT", label: "Pendant" },
              { value: "EARRING", label: "Earrings" },
              { value: "BRACELET", label: "Bracelet" },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="lg">Send for a price</Button>
            <Button variant="outline" size="sm">
              Small
            </Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Refund</Button>
          </div>
        </CardBody>
      </Card>

      <Card as="section">
        <CardHeader>
          <CardTitle>Rows</CardTitle>
        </CardHeader>
        <div>
          <ListRow
            reference="MJ1-RN-C-14"
            title="Halo ring, oval centre"
            meta="Category C · first look within 6 hours"
            trailing={<StatusBadge status="IN_PROGRESS" />}
          />
          <ListRow reference="MJ1-PD-C-15" title="Pendant" meta="Ready to review" trailing={<StatusBadge status="CLIENT_PREVIEW" />} />
        </div>
      </Card>

      <Card as="section">
        <CardHeader>
          <CardTitle>Checklist and uploads</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <ul>
            <ChecklistRow index={1} label="Ring size matches the brief" designer={<CheckBox checked label="Designer" />} qc={<CheckBox checked label="QC" />} />
            <ChecklistRow index={2} label="Prongs at least 0.8 mm" flag="spec" designer={<CheckBox checked label="Designer" />} qc={<CheckBox checked={false} label="QC" />} />
            <ChecklistRow index={19} label="Sign-off" signoff designer={<CheckBox checked={false} label="Designer" />} qc={<CheckBox checked={false} label="QC" />} />
          </ul>
          <div className="grid gap-3 sm:grid-cols-3">
            <UploadSlot code="3DM" label="Rhino model" fileName="RN-C-14_3DM_v1.3dm" />
            <UploadSlot code="STL" label="Print mesh" />
            <UploadSlot code="TV" label="Top view" fileName="RN-C-14_TV_v1.png" />
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
