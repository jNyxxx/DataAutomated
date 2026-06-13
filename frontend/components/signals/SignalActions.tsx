"use client";

import * as React from "react";
import { addTrackedCompetitorAction } from "@/app/(dashboard)/signals/actions";
import { addToast } from "@/components/ui/Toast";

export function AddCompetitorButton() {
  const [loading, setLoading] = React.useState(false);

  const onClick = async () => {
    // We would normally show a modal to capture the competitor details here.
    // For now we'll simulate the action directly.
    setLoading(true);
    try {
      const result = await addTrackedCompetitorAction();
      addToast(result.message, "success");
    } catch {
      addToast("Failed to add competitor", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={onClick} 
      disabled={loading} 
      className="inline-flex items-center gap-1 rounded text-xs font-medium text-blue-400 transition-[transform,colors] duration-200 ease-out active:scale-95 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
    >
      {loading ? "Adding..." : "+ Add"}
    </button>
  );
}
