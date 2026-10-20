import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Section({
  id,
  title,
  action,
  children,
  className,
}: {
  id: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card id={id} className={cn("scroll-mt-4", className)}>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SectionSkeleton({ id, title, lines = 3 }: { id: string; title: string; lines?: number }) {
  return (
    <Section id={id} title={title}>
      <div className="space-y-2" aria-busy="true" aria-label="Cargando">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted" style={{ width: `${100 - i * 12}%` }} />
        ))}
      </div>
    </Section>
  );
}

export function ConnectGooglePrompt({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
      <p>{message ?? "Conecta tu cuenta de Google para ver tu calendario y tu correo (solo lectura)."}</p>
      <a
        href="/api/google/connect"
        className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        Conectar Google
      </a>
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{message}</p>;
}
