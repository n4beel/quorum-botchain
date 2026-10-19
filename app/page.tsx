import PageShell from "@/components/layout/PageShell";
import BotChainGate from "@/components/botchain/BotChainGate";
import CreateWallet from "@/components/quorum/CreateWallet";
import SavedWallets from "@/components/quorum/SavedWallets";
import { NAV } from "@/lib/nav";

export default function Home() {
  return (
    <PageShell
      nav={NAV}
      title="A wallet several people control"
      description="Choose the signers and how many signatures a payment needs. Both are fixed when the wallet is deployed — nobody can rewrite the rules afterwards, including you."
    >
      <div className="flex flex-col gap-5">
        <SavedWallets />

        <BotChainGate>
          <CreateWallet />
        </BotChainGate>
      </div>
    </PageShell>
  );
}
