"use client";

import { Toaster as Sonner, ToasterProps } from "sonner";

// next-themes isn't a dependency in this project — the app is dark-only,
// so we hard-code the toaster theme rather than pulling in another package.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
