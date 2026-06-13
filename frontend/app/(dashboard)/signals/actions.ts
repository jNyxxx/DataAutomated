"use server";

import { getTokenServerSide } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function addTrackedCompetitorAction() {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  
  // Simulate an API call to add a tracked competitor
  await new Promise(resolve => setTimeout(resolve, 800));
  
  revalidatePath("/signals");
  return { success: true, message: "Competitor tracking requested. Our systems are now monitoring their digital footprint." };
}
