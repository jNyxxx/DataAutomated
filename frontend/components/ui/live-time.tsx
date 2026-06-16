"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

export function LiveTime({ time, fallback = "Never" }: { time: string | null | undefined; fallback?: string }) {
  const [display, setDisplay] = useState<string>(() => {
    if (!time) return fallback;
    return `${formatDistanceToNow(new Date(time))} ago`;
  });

  useEffect(() => {
    if (!time) return;

    setDisplay(`${formatDistanceToNow(new Date(time))} ago`);

    const interval = setInterval(() => {
      setDisplay(`${formatDistanceToNow(new Date(time))} ago`);
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [time]);

  return <>{display}</>;
}
