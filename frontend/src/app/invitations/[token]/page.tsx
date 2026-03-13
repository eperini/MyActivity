"use client";

import { useParams, useRouter } from "next/navigation";
import { ToastProvider } from "@/components/Toast";
import AcceptInvitationDialog from "@/components/AcceptInvitationDialog";

export default function InvitationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  return (
    <ToastProvider>
      <div className="min-h-screen bg-zinc-950">
        <AcceptInvitationDialog
          token={token}
          onAccepted={(projectId) => {
            router.push(`/?view=project-${projectId}`);
          }}
          onDeclined={() => {
            router.push("/");
          }}
        />
      </div>
    </ToastProvider>
  );
}
