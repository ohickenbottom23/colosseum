"use client";

import { useState } from "react";

// opens the phone's share sheet with a link to the call, so it can go in a group chat.
// browsers without a share sheet just copy the link
export default function ShareButton({ callId, text }: { callId: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/call/${callId}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "Colosseum", text: `${text}. Pick a side:`, url });
      } catch {
        // they closed the share sheet, that's fine
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard can be blocked too. last resort, show the link so they can copy it
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <button type="button" className="chip share" onClick={share}>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
