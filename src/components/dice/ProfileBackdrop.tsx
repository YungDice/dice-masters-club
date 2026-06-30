import { ReactNode } from "react";

/** Renders a fixed full-page background image with a dark overlay, behind all page content. */
export function ProfileBackdrop({ url, children }: { url: string | null | undefined; children: ReactNode }) {
  return (
    <>
      {url ? (
        <div
          className="fixed inset-0 -z-10 pointer-events-none"
          aria-hidden
          style={{
            backgroundImage: `linear-gradient(to bottom, rgba(8,6,14,0.78), rgba(8,6,14,0.95)), url(${url})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundAttachment: "fixed",
          }}
        />
      ) : null}
      {children}
    </>
  );
}
