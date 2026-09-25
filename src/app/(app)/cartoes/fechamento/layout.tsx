import { SubAbasFechamento } from "./sub-abas";

export default function FechamentoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <SubAbasFechamento />
      {children}
    </div>
  );
}
