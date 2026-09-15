import { NavPrincipal } from "@/components/nav-principal";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <NavPrincipal />
      <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
