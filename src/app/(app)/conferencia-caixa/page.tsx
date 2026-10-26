import { redirect } from "next/navigation";

export const metadata = { title: "Conferência de Caixa" };

export default function ConferenciaCaixaPage() {
  redirect("/conferencia-caixa/upload");
}
