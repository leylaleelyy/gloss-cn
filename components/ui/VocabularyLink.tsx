"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentProps } from "react";

export function VocabularyLink(props: Omit<ComponentProps<typeof Link>, "href">) {
  const pathname = usePathname();
  const [source, setSource] = useState(pathname);
  useEffect(() => {
    const update = () => setSource(location.pathname + location.search + location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [pathname]);
  return <Link {...props} href={pathname === "/vocabulary" ? source : `/vocabulary?from=${encodeURIComponent(source)}`} />;
}
