"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportVocAction } from "@/app/(dashboard)/insights/actions";
import { addToast } from "@/components/ui/Toast";

export function ExportVocButton() {
  const [loading, setLoading] = React.useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const result = await exportVocAction();
      addToast(result.message, "success");
    } catch {
      addToast("Failed to start VoC export", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="ghost" onClick={onClick} disabled={loading} className="text-teal-400 hover:text-teal-300">
      <Download className="size-4 mr-2" /> 
      {loading ? "Exporting..." : "Export"}
    </Button>
  );
}
