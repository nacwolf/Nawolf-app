// ponytail: stand-in for @clerk/react in local dev, aliased in vite.config.ts
// only for the sentinel key pk_test_dev_mock_do_not_use. Signed in as dev-user
// in company dev-org (matches the API mock). Upgrade path: set a real Clerk key.
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

export function useAuth() {
  return { isLoaded: true, isSignedIn: true, userId: devUser.id, orgId: "dev-org" };
}

export function OrganizationSwitcher() {
  return <p className="text-xs text-muted-foreground px-2">Dev Company</p>;
}

export function OrganizationList() {
  return null;
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
