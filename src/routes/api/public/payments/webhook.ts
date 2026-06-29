import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

async function creditDice(userId: string, diceAmount: number, stripeId: string) {
  if (!userId || !Number.isFinite(diceAmount) || diceAmount <= 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const noteTag = `stripe:${stripeId}`;
  // Idempotency: skip if we already credited this Stripe transaction
  const { data: existing } = await supabaseAdmin
    .from("dice_transactions")
    .select("id").eq("source", "stripe").eq("note", noteTag).maybeSingle();
  if (existing) return;

  await supabaseAdmin.rpc("wallet_adjust", {
    _user: userId,
    _delta: diceAmount,
    _type: "event" as any,
    _source: "stripe",
    _ref_kind: "stripe",
    _ref_id: null as any,
    _note: noteTag,
  });
}

async function handlePaymentEvent(obj: any) {
  // obj may be a PaymentIntent, Charge, or Checkout Session — look for our metadata in any of them
  const md = obj?.metadata ?? {};
  const userId = md.userId;
  const diceAmount = Number(md.dice_amount);
  const kind = md.kind;
  if (kind !== "dice_topup" || !userId || !diceAmount) return;
  const refId = obj?.id ?? obj?.payment_intent ?? `${Date.now()}`;
  await creditDice(userId, diceAmount, String(refId));
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        const env: StripeEnv = rawEnv;
        try {
          const event = await verifyWebhook(request, env);
          switch (event.type) {
            case "transaction.completed":
            case "checkout.session.completed":
            case "payment_intent.succeeded":
            case "charge.succeeded":
              await handlePaymentEvent(event.data.object);
              break;
            default:
              console.log("Unhandled event:", event.type);
          }
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
