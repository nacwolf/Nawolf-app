// ponytail: stand-in for @clerk/react when VITE_CLERK_PUBLISHABLE_KEY is unset
// (local dev without Replit secrets). Aliased in vite.config.ts, guarded so it
// never applies where the real key is set. Upgrade path: set a real Clerk key.
import type { ReactNode } from "react";

const devUser = {
  id: "dev-user",
  firstName: "Dev",
  lastName: "User",
  fullName: "Dev User",
  primaryEmailAddress: { emailAddress: "dev@localhost" },
  imageUrl: "",
};

export function ClerkProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function Show({ when, children }: { when: "signed-in" | "signed-out"; children: ReactNode }) {
  return when === "signed-in" ? <>{children}</> : null;
}

export function useUser() {
  return { isLoaded: true, isSignedIn: true, user: devUser };
}

export function useClerk() {
  return {
    signOut: async () => {},
    addListener: () => () => {},
  };
}

export function SignIn() {
  return <p>Dev mode: no Clerk key set, everyone is signed in.</p>;
}

export function SignUp() {
  return <p>Dev mode: no Clerk key set, everyone is signed in.</p>;
}
