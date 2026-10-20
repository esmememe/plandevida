import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccesoDenegado() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Acceso denegado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Este panel es personal y solo admite una cuenta autorizada.</p>
          <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
            Volver a intentar con otra cuenta
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
