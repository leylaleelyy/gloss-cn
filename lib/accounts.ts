/** Accounts are available on the web build. Whether Google is configured is read at runtime. */
export const accountsEnabled = process.env.NEXT_PUBLIC_DESKTOP_LOCAL !== "1";
