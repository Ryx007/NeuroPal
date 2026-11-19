import type { Metadata } from "next";
import { HomeView } from "@/components/app/home/HomeView";

export const metadata: Metadata = { title: "Today" };

export default function Page() {
  return <HomeView />;
}
