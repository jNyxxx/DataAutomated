"use server";

import { getTokenServerSide } from "@/lib/auth";
import { triggerJourneyAnalysis } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function triggerJourneyAnalysisAction(): Promise<{ ok: boolean; error?: string }> {
  const token = getTokenServerSide();
  if (!token) return { ok: false, error: "Unauthorized" };
  try {
    await triggerJourneyAnalysis(token, true);
    revalidatePath("/journeys");
    return { ok: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Analysis trigger failed";
    return { ok: false, error: msg };
  }
}
