"use client";

import {
  type NavigationAdapter,
  type NavigationLinkComponent,
  NavigationProvider,
} from "@chatbot-experiments/client/navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** Renders shared AppLink instances with Next.js client-side navigation. */
const NextNavigationLink: NavigationLinkComponent = ({
  to,
  children,
  ...props
}) => {
  return (
    <Link href={to} {...props}>
      {children}
    </Link>
  );
};

export function WebNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const adapter: NavigationAdapter = {
    push: (path) => router.push(path),
    replace: (path) => router.replace(path),
    back: () => router.back(),
    resolveHref: (path) => path,
  };

  return (
    <NavigationProvider adapter={adapter} linkComponent={NextNavigationLink}>
      {children}
    </NavigationProvider>
  );
}
