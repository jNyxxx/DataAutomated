"use server";

import { getTokenServerSide } from "@/lib/auth";
import { generateReport, triggerVoCAnalysis } from "@/lib/api";

export async function exportVocAction() {
  const token = await getTokenServerSide();
  if (!token) throw new Error("Unauthorized");

  const { report_id } = await generateReport(token, "weekly_voc", "last_7_days", true);
  return {
    success: true,
    message: `VoC report queued (ID: ${report_id}). Download from the Reports page when complete.`,
  };
}

export async function triggerVoCAnalysisAction() {
  const token = await getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  return triggerVoCAnalysis(token, true);
}
