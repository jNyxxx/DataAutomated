"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";

/**
 * Resolves the S3-signed PDF URL on click (async) and shows a loading state
 * while AWS returns the `s3_key`. Routes through server actions so the JWT is attached.
 */
export function DownloadPdfButton({
  reportId,
  label = "Download PDF",
  variant = "default",
  size,
  className,
}: {
  reportId: string;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const downloadUrl = `/api/reports/${reportId}/file?download=1`;

  const onClick = async () => {
    setLoading(true);
    try {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast(err?.message || "Failed to download report", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      disabled={loading}
      onClick={onClick}
      className={className}
    >
      {!loading && <Download className="size-4" />}
      {label}
    </Button>
  );
}
