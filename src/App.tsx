import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");

  async function greet() {
    setGreetMsg(await invoke("greet", { name }));
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome to Tauri + React
      </h1>

      <form
        className="flex w-full max-w-sm items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          greet();
        }}
      >
        <Input
          id="greet-input"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          placeholder="Enter a name..."
        />
        <Button type="submit">Greet</Button>
      </form>

      {greetMsg ? <p className="text-muted-foreground">{greetMsg}</p> : null}
    </main>
  );
}

export default App;
