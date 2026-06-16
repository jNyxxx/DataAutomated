"use server";

import { getTokenServerSide } from "@/lib/auth";
import { addTrackedCompetitor, markSignalRead, triggerSignalAnalysis } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function addTrackedCompetitorAction(competitorName: string) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  if (!competitorName.trim()) throw new Error("Competitor name is required.");

  const result = await addTrackedCompetitor(token, competitorName.trim(), true);

  revalidatePath("/signals");
  return {
    success: true,
    message: result.analysis_queued
      ? `${competitorName} added. Competitive analysis has been queued.`
      : `${competitorName} added. Connect a live NewsAPI source to generate real competitive signals.`,
  };
}

export async function markSignalReadAction(id: string) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  await markSignalRead(token, id, true);
  revalidatePath("/signals");
}

export async function triggerSignalAnalysisAction() {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  return triggerSignalAnalysis(token, true);
}
