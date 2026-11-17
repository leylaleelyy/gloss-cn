"use client";

import type { ComponentProps } from "react";
import { flushStorePersistence } from "@/lib/store";

/** Open the reader in a fresh document, without retaining the landing route's paint state. */
export function ReadLink({ onClick, ...props }: ComponentProps<"a">) {
  return <a {...props} onClick={event => {
    onClick?.(event);
    if (!event.defaultPrevented) flushStorePersistence();
  }} />;
}
