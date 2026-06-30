
REVOKE EXECUTE ON FUNCTION public.buy_listing_tx(uuid, uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.buy_listing_tx(uuid, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.settle_auction_tx(uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.settle_auction_tx(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_fields() FROM PUBLIC, authenticated, anon;
