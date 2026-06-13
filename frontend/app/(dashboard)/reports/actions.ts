"use server";

import { getTokenServerSide } from "@/lib/auth";
import { fetchReportDownloadUrl } from "@/lib/api";

export async function getDownloadUrlAction(id: string) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  return fetchReportDownloadUrl(token, id);
}
