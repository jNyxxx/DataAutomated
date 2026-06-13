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
