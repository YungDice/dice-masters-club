const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) return null;
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full rounded-md bg-orange-500/15 border border-orange-500/30 px-4 py-2 text-center text-xs text-orange-200">
        Payments are in <b>test mode</b>. Use card <code className="font-mono">4242 4242 4242 4242</code> · any future expiry · any CVC.
      </div>
    );
  }
  return null;
}
