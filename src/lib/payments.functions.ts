import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

type CheckoutResult = { clientSecret: string } | { error: string };

// 1 unit of currency = 100 DICE. Min 1 unit = 100 DICE, max 500 units = 50,000 DICE per purchase.
export const createDiceCoinsCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    amountUnits: number;
    currency: "chf" | "eur" | "usd";
    returnUrl: string;
    environment: StripeEnv;
  }) => {
    if (!Number.isInteger(data.amountUnits) || data.amountUnits < 1 || data.amountUnits > 500) {
      throw new Error("Amount must be 1–500");
    }
    if (!["chf", "eur", "usd"].includes(data.currency)) throw new Error("Invalid currency");
    return data;
  })
  .handler(async ({ data, context }): Promise<CheckoutResult> => {
    try {
      const stripe = createStripeClient(data.environment);
      const { data: userData } = await context.supabase.auth.getUser();
      const email = userData.user?.email ?? undefined;
      const diceAmount = data.amountUnits * 100;

      // Resolve or create customer with userId metadata
      const userId = context.userId;
      let customerId: string | undefined;
      const found = await stripe.customers.search({
        query: `metadata['userId']:'${userId}'`,
        limit: 1,
      });
      if (found.data.length) customerId = found.data[0].id;
      else if (email) {
        const byEmail = await stripe.customers.list({ email, limit: 1 });
        if (byEmail.data.length) {
          customerId = byEmail.data[0].id;
          await stripe.customers.update(customerId, { metadata: { userId } });
        }
      }
      if (!customerId) {
        const created = await stripe.customers.create({
          ...(email && { email }),
          metadata: { userId },
        });
        customerId = created.id;
      }

      const session = await stripe.checkout.sessions.create({
        line_items: [{
          price_data: {
            currency: data.currency,
            product_data: { name: `${diceAmount.toLocaleString()} DICE coins` },
            unit_amount: data.amountUnits * 100, // Stripe minor units (cents)
          },
          quantity: 1,
        }],
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        payment_intent_data: {
          description: `${diceAmount.toLocaleString()} DICE coins`,
          metadata: { userId, dice_amount: String(diceAmount), kind: "dice_topup" },
        },
        metadata: { userId, dice_amount: String(diceAmount), kind: "dice_topup" },
      });
      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
