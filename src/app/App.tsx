import { AppShell } from "@/app/components/app-shell";
import { useAppController } from "@/app/hooks/use-app-controller";

function App() {
  const app = useAppController();

  if (app.booting) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Loading hosts…
      </div>
    );
  }

  return <AppShell app={app} />;
}

export default App;
