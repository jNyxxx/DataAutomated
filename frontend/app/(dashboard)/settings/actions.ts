"use server";

import { getTokenServerSide } from "@/lib/auth";
import { createDataSource, deleteDataSource, testDataSource, updateDataSource, createInvite, updateTeamMemberRole, updateOrgName, retryJob } from "@/lib/api";
import type { CreateDataSourcePayload } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function removeSourceAction(id: string) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  await deleteDataSource(token, id, true);
  revalidatePath("/settings");
}

export async function resyncSourceAction(id: string) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  await testDataSource(token, id, true);
  revalidatePath("/settings");
}

export async function testConnectionAction(
  id: string,
): Promise<{ connection_status: string; message?: string; error?: string }> {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  const result = await testDataSource(token, id, true);
  revalidatePath("/settings");
  return result;
}

export async function editSourceSettingsAction(
  id: string,
  payload?: Partial<CreateDataSourcePayload & { is_active: boolean }>,
) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  if (payload) {
    await updateDataSource(token, id, payload, true);
  }
  revalidatePath("/settings");
}

export async function createConnectionAction(
  sourceType: string,
  credentials: Record<string, string>,
  config?: Record<string, unknown>,
) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  const source = await createDataSource(token, { source_type: sourceType, credentials, config }, true);
  try {
    await testDataSource(token, source.id, true);
  } catch (e) {
    // If test fails, the backend already updates the status to failed
  }
  revalidatePath("/settings");
  return source;
}

export async function inviteTeamMemberAction(email: string, role: string) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  const result = await createInvite(token, { email, role }, true);
  revalidatePath("/settings");
  return { accept_url: result.accept_url, email_sent: result.email_sent };
}

export async function changeTeamMemberRoleAction(userId: string, role: string) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  await updateTeamMemberRole(token, userId, role, true);
  revalidatePath("/settings");
}

export async function updateOrgNameAction(name: string) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  const result = await updateOrgName(token, name, true);
  revalidatePath("/settings");
  return result;
}

export async function retryJobAction(jobId: string): Promise<{ status: string; job_id: string }> {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  const result = await retryJob(token, jobId);
  revalidatePath("/settings");
  return result;
}
