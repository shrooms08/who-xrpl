/** Map a Postgres/RPC error (raised as a bare code string) to friendly copy. */
export function lobbyErrorMessage(err: unknown): string {
  const raw =
    (typeof err === "object" && err !== null && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err)) || "Something went wrong.";

  const map: Record<string, string> = {
    lobby_not_found: "No lobby found with that code.",
    lobby_not_joinable: "That game has already started.",
    lobby_full: "That lobby is full.",
    max_players_out_of_range: "Max players must be between 4 and 10.",
    not_authenticated: "Please sign in first.",
    not_a_member: "You are not in this lobby.",
    code_generation_failed: "Could not create a lobby code — try again.",
  };

  for (const key of Object.keys(map)) {
    if (raw.includes(key)) return map[key];
  }
  return raw;
}
