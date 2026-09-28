import { createClient } from "@/lib/supabase/server";
import {
  getSessionPlayoffNights,
  type SessionPlayoffNight,
} from "@/lib/playoff/session-playoff";

export type { SessionPlayoffNight };

/** A league's session playoff nights, as the signed-in viewer may read them. */
export async function getSessionPlayoffs(
  competitionId: string,
): Promise<SessionPlayoffNight[]> {
  const supabase = await createClient();
  return getSessionPlayoffNights(supabase, competitionId);
}
