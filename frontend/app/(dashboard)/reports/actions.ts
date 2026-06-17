"use server";

import { getTokenServerSide } from "@/lib/auth";
import { fetchReportDownloadUrl, generateReport } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function getDownloadUrlAction(id: string) {
  const token = await getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  return fetchReportDownloadUrl(token, id, true);
}

export async function generateReportAction(report_type: string, period: string) {
  const token = await getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  const result = await generateReport(token, report_type, period, true);
  revalidatePath("/reports");
  return result;
}
