"use client";

import {
  type AnchorHTMLAttributes,
  createContext,
  type FC,
  useContext,
} from "react";
import type { NavigationAdapter } from "./types";

/** Props accepted by framework-agnostic navigation links in shared views. */
export type AppLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & { to: string };

/** Platform link renderer injected by apps that provide router-specific link behavior. */
export type NavigationLinkComponent = FC<AppLinkProps>;

type NavigationContextValue = {
  adapter: NavigationAdapter;
  linkComponent?: NavigationLinkComponent;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

/** Provides platform navigation behavior and optional router-specific link rendering. */
export const NavigationProvider: FC<{
  adapter: NavigationAdapter;
  children: React.ReactNode;
  linkComponent?: NavigationLinkComponent;
}> = ({ adapter, children, linkComponent }) => {
  return (
    <NavigationContext.Provider value={{ adapter, linkComponent }}>
      {children}
    </NavigationContext.Provider>
  );
};

function useNavigationContext(): NavigationContextValue {
  const value = useContext(NavigationContext);
  if (!value) {
    throw new Error("useNavigation must be used within a <NavigationProvider>");
  }
  return value;
}

export function useNavigation(): NavigationAdapter {
  return useNavigationContext().adapter;
}

/**
 * Framework-agnostic link component.
 * Shared views use this instead of platform-specific link components.
 */
export const AppLink: FC<AppLinkProps> = ({
  to,
  onClick,
  children,
  target,
  download,
  ...rest
}) => {
  const { adapter, linkComponent: LinkComponent } = useNavigationContext();
  const href = adapter.resolveHref(to);

  if (LinkComponent) {
    return (
      <LinkComponent
        to={href}
        onClick={onClick}
        target={target}
        download={download}
        {...rest}
      >
        {children}
      </LinkComponent>
    );
  }

  return (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (
          e.button !== 0 ||
          e.metaKey ||
          e.altKey ||
          e.ctrlKey ||
          e.shiftKey
        ) {
          return;
        }
        if (target && target !== "_self") return;
        if (download != null) return;

        e.preventDefault();
        adapter.push(to);
      }}
      target={target}
      download={download}
      {...rest}
    >
      {children}
    </a>
  );
};
