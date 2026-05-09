import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { Camera, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

function formatAvatarApiError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (
    msg.includes("No procedure found") ||
    msg.includes("NOT_FOUND") ||
    (e instanceof TRPCClientError && (e.data?.code === "NOT_FOUND" || e.data?.httpStatus === 404))
  ) {
    return "O servidor não tem ainda o endpoint de avatar. Peça ao administrador para fazer deploy da versão mais recente da API e reiniciar o Node.";
  }
  return msg || "Erro ao processar o pedido";
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  avatarUrl: string | null | undefined;
  onAvatarUpdated: () => void;
};

export function UserProfileDialog({
  open,
  onOpenChange,
  displayName,
  avatarUrl,
  onAvatarUpdated,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const uploadMutation = trpc.auth.uploadAvatar.useMutation({
    onSuccess: () => {
      toast.success("Foto de perfil atualizada");
      setPreview(null);
      onAvatarUpdated();
      onOpenChange(false);
    },
    onError: (e) => toast.error(formatAvatarApiError(e)),
  });

  const removeMutation = trpc.auth.removeAvatar.useMutation({
    onSuccess: () => {
      toast.success("Foto de perfil removida");
      setPreview(null);
      onAvatarUpdated();
      onOpenChange(false);
    },
    onError: (e) => toast.error(formatAvatarApiError(e)),
  });

  const handleFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      const mime = file.type;
      if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
        toast.error("Use JPG, PNG ou WebP");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setPreview(dataUrl);
        const base64 = dataUrl.split(",")[1];
        if (!base64) return;
        uploadMutation.mutate({
          base64,
          mimeType: mime as "image/jpeg" | "image/png" | "image/webp",
        });
      };
      reader.readAsDataURL(file);
    },
    [uploadMutation],
  );

  const initial = displayName.charAt(0).toUpperCase() || "?";
  const showSrc = preview || avatarUrl || undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Foto de perfil</DialogTitle>
          <DialogDescription>
            JPG, PNG ou WebP até 2&nbsp;MB. É necessário <code className="text-xs">LOCAL_UPLOAD_ROOT</code> no
            servidor (ver README).
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          <Avatar className="h-24 w-24 border-2 border-muted">
            {showSrc ? (
              <AvatarImage src={showSrc} alt="" className="object-cover" />
            ) : null}
            <AvatarFallback className="text-2xl">{initial}</AvatarFallback>
          </Avatar>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={uploadMutation.isPending || removeMutation.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <Camera className="h-4 w-4 mr-2" />
              Escolher imagem
            </Button>
            {avatarUrl ? (
              <Button
                type="button"
                variant="outline"
                disabled={uploadMutation.isPending || removeMutation.isPending}
                onClick={() => removeMutation.mutate()}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remover
              </Button>
            ) : null}
          </div>
        </div>
        <DialogFooter className="sm:justify-center">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
