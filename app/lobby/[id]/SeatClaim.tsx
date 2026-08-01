"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SignReq = { id: string; qrPng?: string; deeplink?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

type ClaimResp = {
  status: "validated" | "pending" | "rejected" | "expired" | "failed" | "none";
  reason?: string;
};

// Seat-claim flow. Signed ≠ validated: after a signature the tx needs a few
// ledger closes, so we show a "confirming…" pending state (never an error) and
// poll until it validates. We reconcile on mount AND on claim-press so an
// existing/in-flight claim is adopted rather than re-signed, and once a payload
// is signed the claim button is gone — the player is never invited to re-sign.
export function SeatClaimButton({
  lobbyId,
  onVerified,
}: {
  lobbyId: string;
  onVerified: () => void;
}) {
  type Ui =
    | { s: "checking" }
    | { s: "idle" }
    | { s: "awaiting"; req: SignReq }
    | { s: "confirming"; slow: boolean }
    | { s: "error"; msg: string };
  const [ui, setUi] = useState<Ui>({ s: "checking" });
  const cancelled = useRef(false);
  const done = useRef(false);
  // Keep the latest onVerified without making `finish` (and the mount effect)
  // re-fire every parent render.
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    onVerifiedRef.current();
  }, []);

  const reconcile = useCallback(
    () =>
      fetch(`/api/lobby/${lobbyId}/seat-claim/reconcile`, { method: "POST" }).then(
        (r) => r.json() as Promise<ClaimResp>,
      ),
    [lobbyId],
  );

  // Poll a status source ~every 2s until it resolves. Pending never ends the
  // loop; after 30s the copy softens but it keeps watching.
  const watch = useCallback(
    async (poll: () => Promise<ClaimResp>) => {
      const since = Date.now();
      setUi({ s: "confirming", slow: false });
      while (!cancelled.current) {
        let r: ClaimResp;
        try {
          r = await poll();
        } catch {
          r = { status: "pending" };
        }
        if (cancelled.current) return;
        if (r.status === "validated") return finish();
        if (r.status === "rejected")
          return setUi({ s: "error", msg: "signature declined — claim again when ready." });
        if (r.status === "expired")
          return setUi({ s: "error", msg: "request expired — claim again." });
        if (r.status === "failed")
          return setUi({ s: "error", msg: "couldn't verify that payment — claim again." });
        setUi({ s: "confirming", slow: Date.now() - since > 30_000 });
        await sleep(2000);
      }
    },
    [finish],
  );

  // On mount: adopt any existing/in-flight claim without prompting a signature.
  useEffect(() => {
    cancelled.current = false;
    (async () => {
      let r: ClaimResp;
      try {
        r = await reconcile();
      } catch {
        r = { status: "none" };
      }
      if (cancelled.current) return;
      if (r.status === "validated") return finish();
      if (r.status === "pending") return void watch(reconcile);
      setUi({ s: "idle" });
    })();
    return () => {
      cancelled.current = true;
    };
  }, [reconcile, watch, finish]);

  async function claim() {
    setUi({ s: "checking" });
    // Reconcile FIRST — never create a second payload if a claim already exists.
    let rc: ClaimResp;
    try {
      rc = await reconcile();
    } catch {
      rc = { status: "none" };
    }
    if (rc.status === "validated") return finish();
    if (rc.status === "pending") return void watch(reconcile);

    // Create a fresh sign request.
    let cr: Response;
    try {
      cr = await fetch(`/api/lobby/${lobbyId}/seat-claim`, { method: "POST" });
    } catch {
      setUi({ s: "error", msg: "network error — try again." });
      return;
    }
    const req = (await cr.json()) as SignReq & { error?: string };
    if (!cr.ok) {
      setUi({ s: "error", msg: req.error ?? "couldn't start a claim." });
      return;
    }
    setUi({ s: "awaiting", req: { id: req.id, qrPng: req.qrPng, deeplink: req.deeplink } });

    // Poll: show the QR until signed, then "confirming…" until validated.
    let confirmSince: number | null = null;
    while (!cancelled.current) {
      let v: ClaimResp;
      try {
        v = await fetch(`/api/lobby/${lobbyId}/seat-claim/verify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId: req.id }),
        }).then((r) => r.json() as Promise<ClaimResp>);
      } catch {
        v = { status: "pending", reason: "not_validated" };
      }
      if (cancelled.current) return;
      if (v.status === "validated") return finish();
      if (v.status === "rejected")
        return setUi({ s: "error", msg: "signature declined — claim again when ready." });
      if (v.status === "expired")
        return setUi({ s: "error", msg: "request expired — claim again." });
      if (v.status === "failed")
        return setUi({ s: "error", msg: "couldn't verify that payment — claim again." });
      // pending: not_signed keeps the QR; anything else means signed & validating.
      if (v.reason !== "not_signed") {
        if (confirmSince === null) confirmSince = Date.now();
        setUi({ s: "confirming", slow: Date.now() - confirmSince > 30_000 });
      }
      await sleep(2000);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {(ui.s === "idle" || ui.s === "error") && (
        <button
          onClick={claim}
          className="wobble-sketch border-[2.5px] border-hot bg-hot px-3 py-2 font-display text-[16px] text-card"
        >
          claim seat · 12 drops
        </button>
      )}
      {ui.s === "checking" && (
        <span className="font-utility text-[11px] text-muted">checking…</span>
      )}
      {ui.s === "awaiting" && <SignPrompt req={ui.req} />}
      {ui.s === "confirming" && (
        <div className="wobble-1 flex items-center gap-2 border-2 border-dashed border-calm bg-card px-3 py-2">
          <span className="h-2 w-2 animate-tickpulse rounded-full bg-calm" />
          <span className="font-utility text-[12px] text-calm">
            {ui.slow
              ? "taking longer than usual — still watching…"
              : "confirming on the ledger…"}
          </span>
        </div>
      )}
      {ui.s === "error" && (
        <span className="font-body text-[13px] text-muted">{ui.msg}</span>
      )}
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
