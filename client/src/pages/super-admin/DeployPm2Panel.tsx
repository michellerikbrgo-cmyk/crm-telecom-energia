import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { Archive, Database, HardDrive, Loader2, RefreshCw, Rocket } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type JobState = "idle" | "running" | "success" | "error";

type JobStatus = {
  state: JobState;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  outputTail?: string;
};

function formatAt(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-PT", {
      dateStyle: "short",
      timeStyle: "medium",
      timeZone: "Europe/Lisbon",
    });
  } catch {
    return iso;
  }
}

const STATE_LABEL: Record<string, string> = {
  idle: "Pronto",
  running: "Em curso",
  success: "Concluído",
  error: "Falhou",
};

function statusBadgeVariant(state: JobState) {
  if (state === "running") return "default" as const;
  if (state === "success") return "secondary" as const;
  if (state === "error") return "destructive" as const;
  return "outline" as const;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Duração entre startedAt e finishedAt (ou agora se ainda em curso). */
function jobDurationMs(status: JobStatus | undefined, nowMs = Date.now()): number | null {
  if (!status?.startedAt) return null;
  const start = new Date(status.startedAt).getTime();
  if (Number.isNaN(start)) return null;
  const end = status.finishedAt
    ? new Date(status.finishedAt).getTime()
    : status.state === "running"
      ? nowMs
      : null;
  if (end == null || Number.isNaN(end)) return null;
  return Math.max(0, end - start);
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec} s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return s > 0 ? `${m} min ${s} s` : `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h} h ${rm} min` : `${h} h`;
}

function BackupFilesList({
  files,
  emptyLabel,
}: {
  files: { name: string; sizeBytes: number; createdAt: string; label: string }[];
  emptyLabel: string;
}) {
  if (!files.length) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="text-xs space-y-1.5 text-muted-foreground">
      {files.map((f) => (
        <li key={f.name} className="font-mono break-all">
          <span className="text-foreground/80 font-sans font-medium capitalize">{f.label}:</span>{" "}
          {f.name}{" "}
          <span className="text-[10px]">({formatBytes(f.sizeBytes)} · {formatAt(f.createdAt)})</span>
        </li>
      ))}
    </ul>
  );
}

function JobStatusBlock({ status }: { status: JobStatus | undefined }) {
  const state = status?.state ?? "idle";
  const isRunning = state === "running";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning || !status?.startedAt) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [isRunning, status?.startedAt]);

  const durationMs = jobDurationMs(status, now);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusBadgeVariant(state)}>{STATE_LABEL[state] ?? state}</Badge>
        {status?.startedAt ? (
          <span className="text-xs text-muted-foreground">
            {formatAt(status.startedAt)}
            {status.finishedAt ? ` → ${formatAt(status.finishedAt)}` : null}
          </span>
        ) : null}
      </div>
      {durationMs != null && (isRunning || status?.finishedAt) ? (
        <p
          className={
            isRunning
              ? "text-xs font-medium text-amber-700 dark:text-amber-400 tabular-nums"
              : "text-xs font-medium text-foreground/80 tabular-nums"
          }
        >
          {isRunning ? "Tempo decorrido: " : "Duração: "}
          {formatDuration(durationMs)}
        </p>
      ) : null}
      {status?.message ? (
        <p
          className={
            state === "error"
              ? "text-sm text-destructive"
              : state === "success"
                ? "text-sm text-emerald-700 dark:text-emerald-400"
                : "text-sm text-muted-foreground"
          }
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}


function useJobDoneToast(label: string, state: JobState, status: JobStatus | undefined) {
  const prev = useRef<JobState>("idle");
  useEffect(() => {
    if (prev.current === "running" && state === "success") {
      const ms = jobDurationMs(status);
      toast.success(ms ? `${label} concluído em ${formatDuration(ms)}` : `${label} concluído`);
    } else if (prev.current === "running" && state === "error") {
      const ms = jobDurationMs(status);
      toast.error(ms ? `${label} falhou após ${formatDuration(ms)}` : `${label} falhou`);
    }
    prev.current = state;
  }, [label, state, status]);
}

export function DeployPm2Panel() {
  const utils = trpc.useUtils();
  const [deployConfirm, setDeployConfirm] = useState(false);
  const [dbConfirm, setDbConfirm] = useState(false);
  const [backupSysConfirm, setBackupSysConfirm] = useState(false);
  const [backupDbConfirm, setBackupDbConfirm] = useState(false);
  const [logView, setLogView] = useState<"db" | "deploy" | "backupSystem" | "backupDatabase" | null>(null);

  const deployStatusQuery = trpc.admin.getDeployStatus.useQuery(undefined, {
    refetchInterval: (q) => (q.state.data?.state === "running" ? 1000 : undefined),
  });
  const dbStatusQuery = trpc.admin.getDbSyncStatus.useQuery(undefined, {
    refetchInterval: (q) => (q.state.data?.state === "running" ? 1000 : undefined),
  });
  const backupInventoryQuery = trpc.admin.getBackupInventory.useQuery(undefined, {
    refetchInterval: 8000,
  });
  const backupSystemStatusQuery = trpc.admin.getBackupSystemStatus.useQuery(undefined, {
    refetchInterval: (q) => (q.state.data?.state === "running" ? 1000 : undefined),
  });
  const backupDatabaseStatusQuery = trpc.admin.getBackupDatabaseStatus.useQuery(undefined, {
    refetchInterval: (q) => (q.state.data?.state === "running" ? 1000 : undefined),
  });

  const deployMutation = trpc.admin.startDeploy.useMutation({
    onSuccess: async (res) => {
      if (!res.started) {
        toast.error(res.message || "Não foi possível iniciar o deploy");
        return;
      }
      toast.success("Deploy iniciado — acompanhe o tempo em tempo real abaixo");
      setDeployConfirm(false);
      setLogView("deploy");
      await deployStatusQuery.refetch();
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Erro ao iniciar deploy"),
  });

  const dbMutation = trpc.admin.startDbSync.useMutation({
    onSuccess: async (res) => {
      if (!res.started) {
        toast.error(res.message || "Não foi possível iniciar");
        return;
      }
      toast.success("Actualização da base de dados iniciada");
      setDbConfirm(false);
      setLogView("db");
      await dbStatusQuery.refetch();
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Erro"),
  });

  const backupSystemMutation = trpc.admin.startSystemBackup.useMutation({
    onSuccess: async (res) => {
      if (!res.started) {
        toast.error(res.message || "Não foi possível iniciar");
        return;
      }
      toast.success("Backup do sistema iniciado");
      setBackupSysConfirm(false);
      setLogView("backupSystem");
      await backupSystemStatusQuery.refetch();
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Erro"),
  });

  const backupDatabaseMutation = trpc.admin.startDatabaseBackup.useMutation({
    onSuccess: async (res) => {
      if (!res.started) {
        toast.error(res.message || "Não foi possível iniciar");
        return;
      }
      toast.success("Backup da base de dados iniciado");
      setBackupDbConfirm(false);
      setLogView("backupDatabase");
      await backupDatabaseStatusQuery.refetch();
    },
    onError: (e: { message?: string }) => toast.error(e.message || "Erro"),
  });

  const deployState = deployStatusQuery.data?.state ?? "idle";
  const dbState = dbStatusQuery.data?.state ?? "idle";
  const backupSystemState = backupSystemStatusQuery.data?.state ?? "idle";
  const backupDatabaseState = backupDatabaseStatusQuery.data?.state ?? "idle";
  const busy =
    deployState === "running" ||
    dbState === "running" ||
    backupSystemState === "running" ||
    backupDatabaseState === "running" ||
    deployMutation.isPending ||
    dbMutation.isPending ||
    backupSystemMutation.isPending ||
    backupDatabaseMutation.isPending;

  useEffect(() => {
    if (backupSystemState === "success" || backupDatabaseState === "success") {
      void backupInventoryQuery.refetch();
    }
  }, [backupSystemState, backupDatabaseState, backupInventoryQuery]);

  useEffect(() => {
    if (deployState === "success") void utils.admin.getReleaseLog.invalidate();
  }, [deployState, utils.admin.getReleaseLog]);

  const activeLog =
    logView === "db"
      ? dbStatusQuery.data?.outputTail
      : logView === "deploy"
        ? deployStatusQuery.data?.outputTail
        : logView === "backupSystem"
          ? backupSystemStatusQuery.data?.outputTail
          : logView === "backupDatabase"
            ? backupDatabaseStatusQuery.data?.outputTail
            : dbStatusQuery.data?.outputTail ||
              deployStatusQuery.data?.outputTail ||
              backupSystemStatusQuery.data?.outputTail ||
              backupDatabaseStatusQuery.data?.outputTail;


  useJobDoneToast("Deploy", deployState, deployStatusQuery.data);
  useJobDoneToast("Actualização da BD", dbState, dbStatusQuery.data);
  useJobDoneToast("Backup do sistema", backupSystemState, backupSystemStatusQuery.data);
  useJobDoneToast("Backup da base de dados", backupDatabaseState, backupDatabaseStatusQuery.data);

  const refetchAll = () => {
    void deployStatusQuery.refetch();
    void dbStatusQuery.refetch();
    void backupSystemStatusQuery.refetch();
    void backupDatabaseStatusQuery.refetch();
    void backupInventoryQuery.refetch();
  };

  return (
    <Card className="shadow-sm border border-border border-l-[4px] border-l-emerald-600">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Manutenção do servidor</CardTitle>
        <p className="text-sm text-muted-foreground font-normal leading-relaxed">
          Actualize a <strong className="text-foreground/90 font-medium">base de dados</strong> em erros de schema;{" "}
          <strong className="text-foreground/90 font-medium">build</strong> após mudanças no código;{" "}
          <strong className="text-foreground/90 font-medium">backups</strong> em{" "}
          <code className="text-xs">data/backups/</code> (só actual + anterior). Uma operação de cada vez. O tempo de cada operação aparece em tempo real (build típico ~25 s). 
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-3 rounded-lg border p-4 bg-muted/15">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary shrink-0" />
              <h3 className="text-sm font-semibold">Base de dados (schema)</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Migrações Drizzle + <code className="text-[10px]">db:repair</code>. Não reinicia o serviço.
            </p>
            <JobStatusBlock status={dbStatusQuery.data} />
            <Button type="button" variant="secondary" className="gap-2 w-full sm:w-auto" disabled={busy} onClick={() => setDbConfirm(true)}>
              {dbState === "running" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />A actualizar…
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  Actualizar tabelas
                </>
              )}
            </Button>
          </section>

          <section className="space-y-3 rounded-lg border p-4 bg-muted/15">
            <div className="flex items-center gap-2">
              <Rocket className="h-4 w-4 text-emerald-600 shrink-0" />
              <h3 className="text-sm font-semibold">Aplicação (build + PM2)</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <code className="text-[10px]">deploy:pm2</code> — build e reinício do <code className="text-[10px]">crm</code>.
            </p>
            <JobStatusBlock status={deployStatusQuery.data} />
            <Button type="button" className="gap-2 w-full sm:w-auto" disabled={busy} onClick={() => setDeployConfirm(true)}>
              {deployState === "running" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deploy em curso…
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" />
                  Build e reiniciar
                </>
              )}
            </Button>
          </section>
        </div>

        <div className="border-t pt-6 space-y-4">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-amber-600 shrink-0" />
            <h3 className="text-sm font-semibold">Cópias de segurança</h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Mantém apenas <strong className="text-foreground/80">2 ficheiros</strong> por tipo (actual + anterior); apaga
            os restantes automaticamente.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <section className="space-y-3 rounded-lg border p-4 bg-muted/15">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-primary shrink-0" />
                <h4 className="text-sm font-semibold">Sistema (código)</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Arquivo <code className="text-[10px]">.tar.gz</code> do projecto.
              </p>
              <BackupFilesList files={backupInventoryQuery.data?.system ?? []} emptyLabel="Ainda sem backups." />
              <JobStatusBlock status={backupSystemStatusQuery.data} />
              <Button type="button" variant="secondary" className="gap-2 w-full sm:w-auto" disabled={busy} onClick={() => setBackupSysConfirm(true)}>
                {backupSystemState === "running" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A copiar…
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" />
                    Backup do sistema
                  </>
                )}
              </Button>
            </section>
            <section className="space-y-3 rounded-lg border p-4 bg-muted/15">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary shrink-0" />
                <h4 className="text-sm font-semibold">Base de dados (MySQL)</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                <code className="text-[10px]">.sql.gz</code> via mysqldump.
              </p>
              <BackupFilesList files={backupInventoryQuery.data?.database ?? []} emptyLabel="Ainda sem backups." />
              <JobStatusBlock status={backupDatabaseStatusQuery.data} />
              <Button type="button" variant="secondary" className="gap-2 w-full sm:w-auto" disabled={busy} onClick={() => setBackupDbConfirm(true)}>
                {backupDatabaseState === "running" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A exportar…
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4" />
                    Backup da base de dados
                  </>
                )}
              </Button>
            </section>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" disabled={busy} onClick={refetchAll}>
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar estado
          </Button>
        </div>

        {activeLog ? (
          <ScrollArea className="h-[min(220px,32vh)] rounded-md border bg-muted/30 p-3">
            <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all text-muted-foreground">
              {activeLog}
            </pre>
          </ScrollArea>
        ) : null}

        <AlertDialog open={dbConfirm} onOpenChange={setDbConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Actualizar tabelas a partir do schema?</AlertDialogTitle>
              <AlertDialogDescription className="leading-relaxed">
                Migrações pendentes e reparação de colunas em falta. Use quando aparecer «coluna em falta» ou «Failed
                query».
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <Button type="button" onClick={() => dbMutation.mutate()} disabled={dbMutation.isPending}>
                {dbMutation.isPending ? "A iniciar…" : "Sim, actualizar BD"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={deployConfirm} onOpenChange={setDeployConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar deploy em produção?</AlertDialogTitle>
              <AlertDialogDescription className="leading-relaxed">
                Build completo e reinício PM2. O site pode ficar indisponível alguns segundos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <Button type="button" onClick={() => deployMutation.mutate()} disabled={deployMutation.isPending}>
                {deployMutation.isPending ? "A iniciar…" : "Sim, fazer deploy"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={backupSysConfirm} onOpenChange={setBackupSysConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Backup do sistema?</AlertDialogTitle>
              <AlertDialogDescription className="leading-relaxed">
                Será criado um arquivo do código. Mantém-se só o backup actual e o anterior; os mais velhos são
                apagados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <Button type="button" onClick={() => backupSystemMutation.mutate()} disabled={backupSystemMutation.isPending}>
                {backupSystemMutation.isPending ? "A iniciar…" : "Sim, fazer backup"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={backupDbConfirm} onOpenChange={setBackupDbConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Backup da base de dados?</AlertDialogTitle>
              <AlertDialogDescription className="leading-relaxed">
                Exportação MySQL comprimida. Mantém-se só o backup actual e o anterior.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <Button type="button" onClick={() => backupDatabaseMutation.mutate()} disabled={backupDatabaseMutation.isPending}>
                {backupDatabaseMutation.isPending ? "A iniciar…" : "Sim, fazer backup"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
