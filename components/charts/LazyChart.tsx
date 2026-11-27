"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

// Recharts loads in its own chunk, and each chart renders only when it nears the viewport,
// so the page's text and tables are interactive first. Print renders every chart.
const ChartRenderer = dynamic(() => import("./Charts").then((m) => m.ChartRenderer), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-md bg-panel" />,
});

export function LazyChart({ id, data, minHeight }: { id: string; data: unknown; minHeight: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reveal = () => setShow(true);
    window.addEventListener("beforeprint", reveal);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.removeEventListener("beforeprint", reveal);
    };
  }, []);
  return (
    <div ref={ref} style={{ minHeight }}>
      {show ? <ChartRenderer id={id} data={data} /> : <div className="rounded-md bg-panel" style={{ height: minHeight }} />}
    </div>
  );
}
