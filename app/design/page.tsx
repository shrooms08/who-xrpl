import { notFound } from "next/navigation";
import DesignShowcase from "./DesignShowcase";

// Dev-only reference page for the INK SYSTEM. Hidden in production.
export const dynamic = "force-dynamic";

export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignShowcase />;
}
