"use server";

import { getTokenServerSide } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function exportVocAction() {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  
  // Simulate an API call to export raw feedback
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // revalidatePath("/insights"); // Optional, no data changed but doesn't hurt
  return { success: true, message: "VoC data export started. You will receive an email shortly." };
}
