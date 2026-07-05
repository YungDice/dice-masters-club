import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getLeaderboard from "./tools/get-leaderboard";
import getMyProfile from "./tools/get-my-profile";
import getMyWallet from "./tools/get-my-wallet";
import getMyBaddies from "./tools/get-my-baddies";
import getMyDailyMissions from "./tools/get-my-missions";

// The OAuth issuer must be the direct Supabase host, not the `.lovable.cloud`
// proxy. VITE_SUPABASE_PROJECT_ID is inlined by Vite at build time; the
// fallback keeps the module importable during throwaway manifest evaluations.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "dice-mcp",
  title: "DICE",
  version: "0.1.0",
  instructions:
    "Tools for the DICE social gaming platform. Read the signed-in player's profile, wallet, baddies collection, and daily missions, or fetch the public leaderboard.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getLeaderboard, getMyProfile, getMyWallet, getMyBaddies, getMyDailyMissions],
});
