"use server";

import { getTokenServerSide } from "@/lib/auth";
import { deleteDataSource, testDataSource } from "@/lib/api";
import { revalidatePath } from "next/cache";

export async function removeSourceAction(id: string) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  await deleteDataSource(token, id);
  revalidatePath("/settings");
}

export async function resyncSourceAction(id: string) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  await testDataSource(token, id);
  revalidatePath("/settings");
}

export async function editSourceSettingsAction(id: string) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  // Simulate an API call to edit settings
  await new Promise(resolve => setTimeout(resolve, 800));
  revalidatePath("/settings");
}
