import { Show } from "@clerk/react";
import { Redirect, Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-2xl space-y-8">
            <div className="flex justify-center">
              <div className="bg-primary text-primary-foreground w-16 h-16 rounded-xl flex items-center justify-center text-3xl font-bold">K</div>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">
              Precision Margin Tracking for Manufacturers
            </h1>
            <p className="text-xl text-muted-foreground max-w-xl mx-auto">Kostr gives your production managers exact visibility into SKU costs, ingredient price changes, and margin health.</p>
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button asChild size="lg" className="text-lg px-8">
                <Link href="/sign-up">Get Started</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-lg px-8">
                <Link href="/sign-in">Sign In</Link>
              </Button>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
}
