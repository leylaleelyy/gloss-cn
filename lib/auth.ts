import { auth as clerkAuth } from "@clerk/nextjs/server";
import { accountsEnabled } from "./accounts";

/** Local readers remain anonymous; account-only routes still return 401. */
export async function auth() {
  return accountsEnabled ? clerkAuth() : { userId: null };
}
