import { AssistantDock } from '@/components/assistant/VoiceWidget';
import { BuyerHeader } from '@/components/layout';
export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <BuyerHeader sellerUrl={process.env.SELLER_APP_URL || 'http://localhost:3002'} />
      <AssistantDock>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">{children}</main>
      </AssistantDock>
    </div>
  );
}
