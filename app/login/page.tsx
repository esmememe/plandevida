import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function signIn() {
  "use server";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${env.appUrl()}/auth/callback`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?error=1");
  redirect(data.url);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Panel de Vida</CardTitle>
          <p className="text-sm text-muted-foreground">Tu día en una sola página.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action={signIn}>
            <Button type="submit" className="w-full">
              Entrar con Google
            </Button>
          </form>
          {error && (
            <p className="text-sm text-muted-foreground">No se pudo iniciar sesión. Intenta de nuevo.</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
