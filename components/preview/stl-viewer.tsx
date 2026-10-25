"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The preview link's 3D view (SPEC-ADDENDUM A5; owner answer Q18: built from
 * the approved STL). Plain, rotatable, no materials. three.js is loaded on
 * demand so the page shows the renders straight away on slow phones.
 */
export function StlViewer({ url, label }: { url: string; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      try {
        const THREE = await import("three");
        const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const el = box.current;
        if (!el || disposed) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(el.clientWidth, el.clientHeight);
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 0.1, 5000);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a84, 1.1));
        const key = new THREE.DirectionalLight(0xffffff, 1.4);
        key.position.set(1, 2, 3);
        scene.add(key);

        const geometry = await new STLLoader().loadAsync(url);
        if (disposed) return;
        geometry.center();
        geometry.computeVertexNormals();
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color: 0xd9d6cf, metalness: 0.85, roughness: 0.28 }),
        );
        scene.add(mesh);
        geometry.computeBoundingSphere();
        const r = geometry.boundingSphere?.radius ?? 10;
        camera.position.set(0, r * 0.6, r * 3);
        camera.lookAt(0, 0, 0);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.2;

        let frame = 0;
        const tick = () => {
          controls.update();
          renderer.render(scene, camera);
          frame = requestAnimationFrame(tick);
        };
        tick();
        const onResize = () => {
          camera.aspect = el.clientWidth / el.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(el.clientWidth, el.clientHeight);
        };
        window.addEventListener("resize", onResize);
        setState("ready");
        cleanup = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener("resize", onResize);
          controls.dispose();
          geometry.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch {
        if (!disposed) setState("failed");
      }
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [url]);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[var(--r-lg)] border border-border bg-subtle sm:aspect-[4/3]">
      <div ref={box} className="absolute inset-0" role="img" aria-label={`${label} — drag to turn`} />
      {state !== "ready" && (
        <p className="absolute inset-0 flex items-center justify-center text-[length:var(--fs-2)] text-muted-foreground">
          {state === "loading" ? "Loading the 3D view…" : "The 3D view could not load on this device. The pictures below show the piece."}
        </p>
      )}
    </div>
  );
}
