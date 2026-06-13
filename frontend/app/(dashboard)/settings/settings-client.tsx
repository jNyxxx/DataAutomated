"use client";

import { useRouter } from "next/navigation";
import { SourceRowMenu } from "@/components/settings/SourceRowMenu";

export default function SettingsClient({
  sourceId,
  sourceName,
}: {
  sourceId: string;
  sourceName: string;
}) {
  const router = useRouter();

  const handleDisconnect = async () => {
    await fetch(`/api/backend/api/data-sources/${sourceId}`, { method: "DELETE" });
    router.refresh();
  };

  const handleResync = async () => {
    await fetch(`/api/backend/api/data-sources/${sourceId}/test`, { method: "POST" });
    router.refresh();
  };

  return (
    <SourceRowMenu
      sourceName={sourceName}
      onDisconnect={handleDisconnect}
      onResync={handleResync}
    />
  );
}
