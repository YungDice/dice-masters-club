/** Per-bet maximum across all games. Server enforces the same via assert_bet_within_limit. */
export const MAX_BET_USER = 2000;
export const MAX_BET_VIP = 10000;
export function maxBet(isVip: boolean | null | undefined) {
  return isVip ? MAX_BET_VIP : MAX_BET_USER;
}
export function isVipActive(vipUntil: string | null | undefined) {
  return !!vipUntil && new Date(vipUntil) > new Date();
}
