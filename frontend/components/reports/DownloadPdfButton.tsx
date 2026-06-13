"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { getReportPdf } from "@/lib/api";

/**
 * Resolves the S3-signed PDF URL on click (async) and shows a loading state
 * while AWS returns the `s3_key`. Routes through lib/api so the JWT is attached.
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
  const [loading, setLoading] = React.useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const { url } = await getReportPdf(reportId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Surfaced globally via AlertBanner / toast in the host app.
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      isLoading={loading}
      onClick={onClick}
      className={className}
    >
      {!loading && <Download className="size-4" />}
      {label}
    </Button>
  );
}
