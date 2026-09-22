import { Analytics } from '@vercel/analytics/react';
import { DefaultDemo, CustomColorDemo } from "@/components/demo";

function App() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-12 px-6 py-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Expandable Tabs
          </h1>
          <p className="text-sm text-muted-foreground">
            Click a tab to expand its label. Click anywhere outside the group to
            collapse it again.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Default</h2>
          <DefaultDemo />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Custom active colour
          </h2>
          <CustomColorDemo />
        </section>
      </div>
      <Analytics />
    </main>
  );
}

export default App;
