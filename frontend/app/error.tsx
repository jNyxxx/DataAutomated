"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global Error Boundary caught:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md rounded-xl bg-slate-800 p-6 shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center gap-3 text-red-400">
          <AlertCircle className="size-6" />
          <h2 className="text-lg font-semibold">Something went wrong!</h2>
        </div>
        <p className="mt-4 text-sm text-slate-300">
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-slate-500">Digest: {error.digest}</p>
        )}
        <button
          onClick={() => reset()}
          className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
