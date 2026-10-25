/** Public, build-time switch shared by the server and browser. */
export const accountsEnabled =
  process.env.NEXT_PUBLIC_DESKTOP_LOCAL !== "1" &&
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
