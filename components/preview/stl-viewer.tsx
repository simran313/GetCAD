"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A rotatable STL (SPEC-ADDENDUM A5, the preview link; and the designer's
 * final review). three.js is loaded on demand so the page shows straight
 * away on slow phones.
 *
 * The file is read with fetch, with progress. If the storage host refuses a
 * cross-site read, `fallbackUrl` (our own stream of the same file, behind the
 * same gate) is tried; if that fails too, the real reason is shown with a
 * link to download the file (owner, 2 Nov 2026: the 3D view did not load).
 */
async function readWithProgress(url: string, onProgress: (pct: number | null) => void): Promise<ArrayBuffer> {
  const res = await fetch(url, { credentials: url.startsWith("/") ? "same-origin" : "omit" });
  if (!res.ok) throw new Error(`the file answered ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  if (!res.body || !total) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(99, Math.round((got / total) * 100)));
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out.buffer;
}

export function StlViewer({
  url,
  fallbackUrl,
  label,
  failedText = "The 3D view could not load on this device. The pictures below show the piece.",
  downloadUrl,
  fill = false,
  fileKey,
}: {
  url: string;
  fallbackUrl?: string;
  label: string;
  failedText?: string;
  downloadUrl?: string;
  /** Fill the parent's height (the final review) instead of a fixed shape. */
  fill?: boolean;
  /**
   * What the file is (its version id). The view loads once per file: a page
   * refresh that signs a new address for the same file does not reload it
   * (owner, 2 Nov 2026: every checklist tick reloaded the 3D view).
   */
  fileKey?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [progress, setProgress] = useState<number | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  // The addresses as of this load; a fresh signature for the same file is ignored.
  const source = useRef({ url, fallbackUrl });
  const loadKey = fileKey ?? url;
  const loaded = useRef<string | null>(null);
  if (loaded.current !== loadKey) source.current = { url, fallbackUrl };

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    loaded.current = loadKey;
    const { url: from, fallbackUrl: backup } = source.current;
    (async () => {
      try {
        const THREE = await import("three");
        const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");

        let bytes: ArrayBuffer;
        try {
          bytes = await readWithProgress(from, (p) => !disposed && setProgress(p));
        } catch (first) {
          if (!backup) throw first;
          setProgress(null);
          bytes = await readWithProgress(backup, (p) => !disposed && setProgress(p));
        }
        const el = box.current;
        if (!el || disposed) return;

        const geometry = new STLLoader().parse(bytes);
        geometry.center();
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        const r = geometry.boundingSphere?.radius || 10;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(el.clientWidth || 1, el.clientHeight || 1);
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        // A soft studio light, so polished metal reads as metal rather than black.
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        const camera = new THREE.PerspectiveCamera(35, (el.clientWidth || 1) / (el.clientHeight || 1), r / 100, r * 100);
        const key = new THREE.DirectionalLight(0xffffff, 1.2);
        key.position.set(1, 2, 3);
        scene.add(key, new THREE.HemisphereLight(0xffffff, 0x8a8a84, 0.6));

        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xe6c27a, metalness: 0.7, roughness: 0.3 }));
        scene.add(mesh);
        camera.position.set(0, r * 0.6, r * 3);
        camera.lookAt(0, 0, 0);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.2;
        renderer.domElement.addEventListener("pointerdown", () => (controls.autoRotate = false), { once: true });

        let frame = 0;
        const tick = () => {
          controls.update();
          renderer.render(scene, camera);
          frame = requestAnimationFrame(tick);
        };
        tick();
        const resize = new ResizeObserver(() => {
          const w = el.clientWidth || 1;
          const h = el.clientHeight || 1;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        });
        resize.observe(el);
        setState("ready");
        cleanup = () => {
          cancelAnimationFrame(frame);
          resize.disconnect();
          controls.dispose();
          geometry.dispose();
          pmrem.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch (e) {
        if (!disposed) {
          setReason(e instanceof Error ? e.message : String(e));
          setState("failed");
        }
      }
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [loadKey]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[var(--r-lg)] border border-border bg-subtle",
        fill ? "h-full min-h-[320px]" : "aspect-square sm:aspect-[4/3]",
      )}
      data-state={state}
    >
      <div ref={box} className="absolute inset-0" role="img" aria-label={`${label} — drag to turn`} />
      {state !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-[length:var(--fs-2)] text-muted-foreground">
          {state === "loading" ? (
            <p>Loading the 3D view…{progress != null ? ` ${progress}%` : ""}</p>
          ) : (
            <>
              <p>{failedText}</p>
              {reason && <p className="font-mono text-[length:var(--fs-1)]">({reason})</p>}
              {downloadUrl && (
                <a href={downloadUrl} className="underline underline-offset-4">
                  Download the STL
                </a>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
