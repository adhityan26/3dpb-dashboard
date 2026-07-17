"use client";
import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Teaser } from "@/components/Teaser";
import { ValueProps } from "@/components/ValueProps";
import { TierCompare } from "@/components/TierCompare";
import { Faq } from "@/components/Faq";
import { Footer } from "@/components/Footer";
import { WaitlistModal } from "@/components/WaitlistModal";

export default function Home() {
  const [wl, setWl] = useState<"beli" | "subscribe" | null>(null);
  return (
    <main className="min-h-dvh">
      <Navbar />
      <div className="max-w-5xl mx-auto px-5 space-y-16 py-8">
        <Hero />
        <section id="teaser"><Teaser onWaitlist={setWl} /></section>
        <ValueProps />
        <TierCompare onWaitlist={setWl} />
        <Faq />
      </div>
      <Footer />
      {wl && <WaitlistModal interest={wl} onClose={() => setWl(null)} />}
    </main>
  );
}
