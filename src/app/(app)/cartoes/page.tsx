import { redirect } from "next/navigation";

export const metadata = { title: "Cartões" };

export default function CartoesPage() {
  redirect("/cartoes/conciliacao");
}
