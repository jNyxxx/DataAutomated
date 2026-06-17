"use server";

import { getTokenServerSide } from "@/lib/auth";
import {
  addTrackedCompetitor,
  triggerVoCAnalysis,
  triggerSignalAnalysis,
  triggerJourneyAnalysis,
} from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function addCompetitorAction(
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = await getTokenServerSide();
  if (!token) return { ok: false, error: "Unauthorized" };
  try {
    await addTrackedCompetitor(token, name, true);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to add competitor" };
  }
}

export async function triggerAllAnalysisAction(): Promise<{ ok: boolean }> {
  const token = await getTokenServerSide();
  if (!token) return { ok: false };
  await Promise.allSettled([
    triggerVoCAnalysis(token, true),
    triggerSignalAnalysis(token, true),
    triggerJourneyAnalysis(token, true),
  ]);
  revalidatePath("/dashboard");
  return { ok: true };
}
