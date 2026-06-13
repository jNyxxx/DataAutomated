"use server";

import { getTokenServerSide } from "@/lib/auth";
import { fetchReportDownloadUrl } from "@/lib/api";

export async function getDownloadUrlAction(id: string) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  return fetchReportDownloadUrl(token, id);
}

export async function shareToSlackAction(id: string) {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  // Simulate an API call to share the report to a Slack channel
  await new Promise(resolve => setTimeout(resolve, 800));
  return { success: true, message: "Report successfully shared to #exec-briefing" };
}

export async function exportAllReportsAction() {
  const token = getTokenServerSide();
  if (!token) throw new Error("Unauthorized");
  // Simulate an API call to export all reports
  await new Promise(resolve => setTimeout(resolve, 1000));
  return { success: true, message: "Export started. You will receive an email shortly." };
}
