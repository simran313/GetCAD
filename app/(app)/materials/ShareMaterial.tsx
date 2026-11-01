"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { actionErrorText } from "@/lib/refusal";

import { beginMaterialUploadAction, finishMaterialUploadAction } from "./actions";

function send(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("upload failed — check the connection and try again"));
    xhr.send(file);
  });
}

/** The pod lead's form: a file, a title, what it is for (Phase 13b). */
export function ShareMaterial({ pods }: { pods: { id: string; name: string }[] }) {
  const router = useRouter();
  const ids = { pod: useId(), title: useId(), description: useId(), file: useId() };
  const fileRef = useRef<HTMLInputElement>(null);
  const [podId, setPodId] = useState(pods[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState<number | null>(null);

  async function share() {
    if (!file || !title.trim()) return;
    setPct(0);
    try {
      const { url, key } = await beginMaterialUploadAction(podId, file.size);
      await send(url, file, setPct);
      await finishMaterialUploadAction({ podId, key, title, description, fileName: file.name, browserType: file.type });
      toast("Shared with the pod");
      setTitle("");
      setDescription("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      toast(actionErrorText(e) ?? (e instanceof Error ? e.message : "Not shared"), "danger");
    } finally {
      setPct(null);
    }
  }

  return (
    <Card as="section">
      <CardHeader>
        <CardTitle>Share with your pod</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void share();
          }}
        >
          {pods.length > 1 && (
            <Field label="Pod" htmlFor={ids.pod}>
              <Select id={ids.pod} value={podId} onChange={(e) => setPodId(e.target.value)}>
                {pods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Title" htmlFor={ids.title}>
            <Input id={ids.title} required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Prong size chart" />
          </Field>
          <Field label="File" htmlFor={ids.file} hint="PDF, PNG, JPEG, ZIP or STEP, up to 50 MB.">
            <Input
              ref={fileRef}
              id={ids.file}
              type="file"
              required
              accept=".pdf,.png,.jpg,.jpeg,.zip,.step,.stp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Field label="What it is for" htmlFor={ids.description} optional className="md:col-span-2">
            <Textarea
              id={ids.description}
              maxLength={2000}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Minimum prong and wall sizes by stone size. Check before every submission."
            />
          </Field>
          <div className="flex items-center gap-3 md:col-span-2">
            <Button type="submit" disabled={pct !== null || !file || !title.trim()}>
              <Upload aria-hidden />
              {pct === null ? "Share" : pct < 100 ? `Uploading ${pct}%` : "Checking…"}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
