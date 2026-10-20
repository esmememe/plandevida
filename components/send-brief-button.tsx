"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { sendBriefNow } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function SendBriefButton() {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {msg && <span className="hidden text-xs text-muted-foreground sm:inline">{msg}</span>}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMsg(null);
            const res = await sendBriefNow();
            setMsg(res.ok ? "Resumen enviado a tu correo" : res.error);
            if (!res.ok) alert(res.error);
          })
        }
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />}
        <span>{pending ? "Enviando…" : "Enviar resumen ahora"}</span>
      </Button>
    </div>
  );
}
