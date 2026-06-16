"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/Toast";
import type { TeamMember } from "@/lib/types";

// ---- Server actions are imported where this component is used (settings page)
// so the component accepts callbacks to keep it purely presentational + client.

interface TeamSectionProps {
  members: TeamMember[];
  currentUserId: string;
  currentUserRole: string;
  onInvite: (email: string, role: string) => Promise<{ accept_url?: string; email_sent: boolean }>;
  onChangeRole: (userId: string, role: string) => Promise<void>;
}

const ROLE_STYLES: Record<string, "info" | "warning" | "neutral"> = {
  admin: "info",
  analyst: "warning",
  viewer: "neutral",
};

export function TeamSection({
  members,
  currentUserId,
  currentUserRole,
  onInvite,
  onChangeRole,
}: TeamSectionProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Invite form state
  const [showInvite, setShowInvite] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState("analyst");
  const [inviting, setInviting] = React.useState(false);

  // Role change pending state
  const [changingRole, setChangingRole] = React.useState<string | null>(null);

  const isAdmin = currentUserRole === "admin";

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const result = await onInvite(inviteEmail.trim(), inviteRole);
      if (result.accept_url) {
        // Dev mode — show the accept URL so admin can share it manually
        toast(
          `Invite created. Share this link: ${result.accept_url}`,
          "success",
        );
      } else {
        toast(`Invite sent to ${inviteEmail}`, "success");
      }
      setInviteEmail("");
      setShowInvite(false);
      router.refresh();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to send invite", "error");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    setChangingRole(userId);
    try {
      await onChangeRole(userId, newRole);
      toast("Role updated", "success");
      router.refresh();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to update role", "error");
    } finally {
      setChangingRole(null);
    }
  };

  return (
    <section className="mt-5 rounded-xl bg-slate-800 p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="truncate text-sm font-semibold text-white">Team members</h2>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowInvite((v) => !v)}
          >
            {showInvite ? "Cancel" : "+ Invite"}
          </Button>
        )}
      </div>

      {/* Invite form */}
      {showInvite && isAdmin && (
        <form
          onSubmit={handleInvite}
          className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-slate-900/50 p-3"
        >
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Email address
            </label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              placeholder="teammate@company.com"
              className="w-full rounded-md bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 ring-1 ring-inset ring-slate-700 focus:outline-none focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-md bg-slate-800 px-3 py-2 text-sm text-white ring-1 ring-inset ring-slate-700 focus:outline-none focus:ring-blue-500"
            >
              <option value="analyst">Analyst</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={inviting || !inviteEmail.trim()}
          >
            {inviting ? "Sending…" : "Send invite"}
          </Button>
        </form>
      )}

      {/* Team table */}
      <div className="-mx-2 overflow-x-auto px-2">
        <table className="w-full min-w-[400px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium uppercase tracking-wider text-slate-400">
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Role</th>
              {isAdmin && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-white/5">
            {members.map((member) => (
              <tr key={member.id} className="hover:bg-slate-700/30 group transition-colors">
                <td className="px-3 py-3 font-medium text-slate-100">
                  {member.email}
                  {member.id === currentUserId && (
                    <span className="ml-2 text-xs text-slate-500">(you)</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <Badge variant={ROLE_STYLES[member.role] ?? "neutral"}>
                    {member.role}
                  </Badge>
                </td>
                {isAdmin && (
                  <td className="px-3 py-3 text-right">
                    {member.id !== currentUserId && (
                      <select
                        value={member.role}
                        disabled={changingRole === member.id}
                        onChange={(e) => handleRoleChange(member.id, e.target.value)}
                        className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                      >
                        <option value="admin">Admin</option>
                        <option value="analyst">Analyst</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
