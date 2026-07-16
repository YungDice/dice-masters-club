CREATE OR REPLACE FUNCTION public.cleanup_stale_data()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.game_rooms
   WHERE status IN ('finished','cancelled')
     AND COALESCE(finished_at, updated_at, created_at) < now() - INTERVAL '24 hours';
  DELETE FROM public.game_rooms
   WHERE status = 'waiting' AND created_at < now() - INTERVAL '24 hours';
  DELETE FROM public.game_invites WHERE created_at < now() - INTERVAL '24 hours';
  DELETE FROM public.chat_messages WHERE created_at < now() - INTERVAL '24 hours';
  DELETE FROM public.notifications WHERE read = true AND created_at < now() - INTERVAL '7 days';
  DELETE FROM public.marketplace_listings
   WHERE status IN ('expired','rejected') AND updated_at < now() - INTERVAL '7 days';
END $$;