ALTER TABLE public.chat_messages DROP CONSTRAINT chat_messages_body_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_body_check
  CHECK ((length(body) <= 4000) AND (length(body) >= 1 OR media_url IS NOT NULL));