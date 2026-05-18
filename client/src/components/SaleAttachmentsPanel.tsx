import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { FileText, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

function canDeleteDocs(user: { crmRole?: string; isSuperAdmin?: boolean } | null | undefined) {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return ["ce", "cej", "coordenador"].includes(user.crmRole ?? "");
}

export function SaleAttachmentsPanel({
  saleId,
  publicSaleId,
}: {
  saleId: number;
  publicSaleId?: string | null;
}) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const listQuery = trpc.sales.listAttachments.useQuery({ saleId });
  const uploadMutation = trpc.sales.uploadAttachment.useMutation({
    onSuccess: async () => {
      toast.success("Documento carregado");
      await utils.sales.listAttachments.invalidate({ saleId });
    },
    onError: (e) => toast.error(e.message || "Erro no upload"),
  });
  const deleteMutation = trpc.sales.deleteAttachment.useMutation({
    onSuccess: async () => {
      toast.success("Documento eliminado");
      await utils.sales.listAttachments.invalidate({ saleId });
    },
    onError: (e) => toast.error(e.message || "Erro ao eliminar"),
  });

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    const ok =
      lower.endsWith(".pdf") ||
      lower.endsWith(".png") ||
      lower.endsWith(".jpg") ||
      lower.endsWith(".jpeg") ||
      lower.endsWith(".webp");
    if (!ok) {
      toast.error("Formatos: PDF, PNG, JPG, WEBP.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Máximo 15 MB.");
      return;
    }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    uploadMutation.mutate({
      saleId,
      filename: file.name,
      base64: btoa(binary),
      mimeType: file.type || undefined,
    });
  };

  const allowDelete = canDeleteDocs(user as { crmRole?: string; isSuperAdmin?: boolean });

  return (
    <div className="space-y-4 py-2">
      <p className="text-xs text-muted-foreground">
        Anexos da venda{" "}
        <span className="font-mono text-foreground">{publicSaleId || `#${saleId}`}</span>. PDF ou imagem até
        15 MB.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          void onPickFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={uploadMutation.isPending}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="h-4 w-4" />
        Carregar documento
      </Button>
      {listQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : !listQuery.data?.length ? (
        <p className="text-sm text-muted-foreground">Sem anexos.</p>
      ) : (
        <ul className="space-y-2">
          {listQuery.data.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium truncate block hover:underline"
                  >
                    {f.originalName}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {f.uploaderName ? `${f.uploaderName} · ` : ""}
                    {new Date(f.createdAt as unknown as string).toLocaleString("pt-PT")}
                  </span>
                </div>
              </div>
              {allowDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate({ attachmentId: f.id })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}