import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get-my-profile";
import getMyWallet from "./tools/get-my-wallet";
import listActiveChallenges from "./tools/list-active-challenges";
import listMarketplace from "./tools/list-marketplace";

// The OAuth issuer must be the direct Supabase host — the .lovable.cloud proxy
// URL fails the RFC 8414 issuer-match check that mcp-js performs at token
// verification time. VITE_SUPABASE_PROJECT_ID is inlined by Vite at build.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "dice-mcp",
  title: "DICE",
  version: "0.1.0",
  instructions:
    "Tools for DICE — a social virtual-currency gaming platform. Read the signed-in user's profile and DICE wallet, and browse active challenges and marketplace listings.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, getMyWallet, listActiveChallenges, listMarketplace],
});
