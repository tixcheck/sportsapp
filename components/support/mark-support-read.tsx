"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { markSupportReadAction } from "@/server/actions/support";

/** Clears the admin's unread flag once a conversation has been opened. */
export function MarkSupportRead({
  threadId,
  unread,
}: {
  threadId: string;
  unread: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!unread) return;
    void markSupportReadAction(threadId).then(() => router.refresh());
  }, [threadId, unread, router]);
  return null;
}
