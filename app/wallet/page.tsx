import PageShell from "@/components/layout/PageShell";
import WalletView from "@/components/quorum/WalletView";
import { NAV } from "@/lib/nav";

export const metadata = {
  title: "Open a wallet — Quorum",
  description: "Read any Quorum wallet on BOT Chain: signers, threshold, and the transaction queue.",
};

export default function WalletPage() {
  return (
    <PageShell nav={NAV} title="Open a wallet" description="Paste its address to see the signers and what is waiting on signatures.">
      <WalletView />
    </PageShell>
  );
}
