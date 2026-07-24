"use client";

import { useState } from "react";

type SignReq = { id: string; qrPng?: string; deeplink?: string };

// Runs a Xaman sign flow: create request → (real) show QR/deeplink + poll, or
// (mock) resolve immediately. `create` returns the sign request; `verify`
// resolves it to a boolean until signed. Shared by wallet-link + seat-claim.
async function runSignFlow(
  create: () => Promise<Response>,
  verify: (requestId: string) => Promise<Response>,
  onShow: (r: SignReq | null) => void,
  isDone: (json: unknown) => boolean,
): Promise<string | null> {
  const cr = await create();
  const req = (await cr.json()) as SignReq & { error?: string };
  if (!cr.ok) return req.error ?? "failed";
  if (req.qrPng || req.deeplink) onShow({ id: req.id, qrPng: req.qrPng, deeplink: req.deeplink });
  for (let i = 0; i < 90; i++) {
    const vr = await verify(req.id);
    const v = await vr.json();
    if (isDone(v)) {
      onShow(null);
      return null;
    }
    const reason = (v as { reason?: string }).reason;
    if (reason && reason !== "not_signed") {
      onShow(null);
      return reason;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  onShow(null);
  return "timed out — try again";
}

function SignPrompt({ req }: { req: SignReq }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {req.qrPng && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={req.qrPng}
          alt="scan with Xaman"
          className="wobble-1 h-40 w-40 border-2 border-ink"
        />
      )}
      {req.deeplink && (
        <a
          href={req.deeplink}
          target="_blank"
          rel="noopener noreferrer"
          className="font-utility text-[12px] text-calm underline"
        >
          open in Xaman
        </a>
      )}
      <span className="font-utility text-[11px] text-muted">waiting for signature…</span>
    </div>
  );
}

export function SeatClaimButton({
  lobbyId,
  onVerified,
}: {
  lobbyId: string;
  onVerified: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [req, setReq] = useState<SignReq | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setBusy(true);
    setError(null);
    const err = await runSignFlow(
      () => fetch(`/api/lobby/${lobbyId}/seat-claim`, { method: "POST" }),
      (requestId) =>
        fetch(`/api/lobby/${lobbyId}/seat-claim/verify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId }),
        }),
      setReq,
      (v) => (v as { verified?: boolean }).verified === true,
    );
    setBusy(false);
    if (err) setError(err);
    else onVerified();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={claim}
        disabled={busy}
        className="wobble-sketch border-[2.5px] border-hot bg-hot px-3 py-2 font-display text-[16px] text-card disabled:opacity-50"
      >
        {busy ? "claiming…" : "claim seat · 12 drops"}
      </button>
      {req && <SignPrompt req={req} />}
      {error && <span className="font-body text-[13px] text-muted">{error}</span>}
    </div>
  );
}

export function WalletLinkButton({
  linkedAddress,
  onLinked,
}: {
  linkedAddress: string | null;
  onLinked: (address: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [req, setReq] = useState<SignReq | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function link() {
    setBusy(true);
    setError(null);
    let address = "";
    const err = await runSignFlow(
      () => fetch(`/api/wallet/link`, { method: "POST" }),
      (requestId) =>
        fetch(`/api/wallet/resolve`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId }),
        }),
      setReq,
      (v) => {
        const j = v as { linked?: boolean; address?: string };
        if (j.linked && j.address) address = j.address;
        return j.linked === true;
      },
    );
    setBusy(false);
    if (err) setError(err);
    else if (address) onLinked(address);
  }

  if (linkedAddress) {
    return (
      <span className="font-utility text-[11px] text-calm">
        ✓ wallet {linkedAddress.slice(0, 6)}…{linkedAddress.slice(-4)}
      </span>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={link}
        disabled={busy}
        className="wobble-2 border-2 border-ink px-3 py-1.5 font-utility text-[12px] hover:bg-ink hover:text-paper disabled:opacity-50"
      >
        {busy ? "connecting…" : "connect Xaman wallet"}
      </button>
      {req && <SignPrompt req={req} />}
      {error && <span className="font-body text-[13px] text-muted">{error}</span>}
    </div>
  );
}
