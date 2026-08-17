import { useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coins, X } from "lucide-react";
import { getStripe, getStripeEnvironment, isPaymentsConfigured } from "@/lib/stripe";
import { createDiceCoinsCheckout } from "@/lib/payments.functions";
import { fmt } from "@/lib/format";
import { toast } from "sonner";

const PRESETS = [5, 10, 20, 50, 100];

export function BuyCoinsCard() {
  const [currency, setCurrency] = useState<"chf" | "eur" | "usd">("eur");
  const [units, setUnits] = useState(10);
  const [open, setOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isPaymentsConfigured()) {
    return (
      <Card className="glass p-6 border-white/10">
        <h2 className="font-display text-lg font-medium flex items-center gap-2"><Coins className="text-foreground" /> Buy DICE coins</h2>
        <p className="text-sm text-muted-foreground mt-2">Payments are not yet configured in production. Complete Stripe go-live to enable purchases.</p>
      </Card>
    );
  }

  async function start() {
    setBusy(true);
    try {
      const res = await createDiceCoinsCheckout({
        data: {
          amountUnits: units,
          currency,
          returnUrl: `${window.location.origin}/profile?topup=success&session_id={CHECKOUT_SESSION_ID}`,
          environment: getStripeEnvironment(),
        },
      });
      if ("error" in res) throw new Error(res.error);
      setClientSecret(res.clientSecret);
      setOpen(true);
    } catch (e: any) {
      toast.error(e.message ?? "Could not start checkout");
    } finally { setBusy(false); }
  }

  const dice = units * 1000;

  return (
    <Card className="glass p-6 space-y-4 border-white/10">
      <div>
        <h2 className="font-display text-lg font-medium flex items-center gap-2"><Coins className="text-foreground" /> Buy DICE coins</h2>
        <p className="text-xs text-muted-foreground mt-1">1 {currency.toUpperCase()} = 1,000 DICE · purchases are non-refundable, non-transferable, and have no real-world value.</p>
      </div>
      {!open ? (
        <>
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map((p) => (
              <Button key={p} type="button" size="sm" variant={units === p ? "default" : "outline"} onClick={() => setUnits(p)}>
                {p} {currency.toUpperCase()} <span className="ml-1 text-xs opacity-70">+{(p * 1000).toLocaleString()} DICE</span>
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Custom amount</Label>
              <Input type="number" min={1} max={500} value={units} onChange={(e) => setUnits(Math.max(1, Math.min(500, +e.target.value || 1)))} />
            </div>
            <div>
              <Label>Currency</Label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={currency} onChange={(e) => setCurrency(e.target.value as any)}>
                <option value="eur">EUR</option><option value="chf">CHF</option><option value="usd">USD</option>
              </select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md bg-white/5 p-3">
            <div className="text-sm">Total</div>
            <div className="text-sm"><b>{units} {currency.toUpperCase()}</b> → <b className="text-foreground">{fmt(dice)} DICE</b></div>
          </div>
          <Button onClick={start} disabled={busy} className="glow-red w-full">{busy ? "Loading..." : `Buy ${fmt(dice)} DICE`}</Button>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setOpen(false); setClientSecret(null); }}><X className="size-4 mr-1" />Close</Button>
          </div>
          {clientSecret && (
            <EmbeddedCheckoutProvider stripe={getStripe()} options={{ clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </div>
      )}
    </Card>
  );
}
