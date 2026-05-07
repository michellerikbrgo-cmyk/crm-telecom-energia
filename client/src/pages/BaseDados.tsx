import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap, Upload, FileSpreadsheet, Plus } from "lucide-react";
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function BaseDados() {
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [phoneCol, setPhoneCol] = useState("");
  const [nameCol, setNameCol] = useState("");
  const [listName, setListName] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const bulkAddMutation = trpc.contacts.bulkAdd.useMutation({
    onSuccess: (data: any) => {
      toast.success(`${data.count} contactos adicionados com sucesso!`);
      setFile(null);
      setColumns([]);
      setRows([]);
      setPhoneCol("");
      setNameCol("");
      setListName("");
      setIsUploading(false);
    },
    onError: (err: any) => {
      toast.error(err.message);
      setIsUploading(false);
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);

    // Parse Excel file in browser
    const XLSX = await import("xlsx");
    const data = await selectedFile.arrayBuffer();
    const workbook = XLSX.read(data);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[];

    if (jsonData.length > 0) {
      const headers = jsonData[0] as string[];
      setColumns(headers.map(h => String(h || "")));
      setRows(jsonData.slice(1));
      toast.success(`Ficheiro carregado: ${jsonData.length - 1} linhas encontradas`);
    }
  };

  const handleUpload = () => {
    if (!phoneCol) {
      toast.error("Selecione a coluna de telefone");
      return;
    }

    setIsUploading(true);
    const phoneIndex = columns.indexOf(phoneCol);
    const nameIndex = nameCol ? columns.indexOf(nameCol) : -1;

    const phones = rows
      .map(row => String(row[phoneIndex] || "").trim())
      .filter(p => p.length > 0);

    const names = nameIndex >= 0
      ? rows.map(row => String(row[nameIndex] || "").trim())
      : [];

    bulkAddMutation.mutate({
      phones,
      names: names.length > 0 ? names : undefined,
      listName: listName || undefined,
      assignTo: assignTo ? parseInt(assignTo) : undefined,
    } as any);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Base de Dados</h1>
          <p className="text-muted-foreground">Alimentar a base de contactos para distribuição automática</p>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Upload de Lista Excel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Ficheiro Excel (.xlsx)</Label>
              <Input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="cursor-pointer"
              />
            </div>

            {columns.length > 0 && (
              <>
                <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                  <p className="text-sm text-green-700 font-medium">
                    {rows.length} contactos encontrados no ficheiro
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Coluna de Telefone *</Label>
                    <Select value={phoneCol} onValueChange={setPhoneCol}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {columns.map((col, i) => (
                          <SelectItem key={i} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Coluna de Nomes (opcional)</Label>
                    <Select value={nameCol} onValueChange={setNameCol}>
                      <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {columns.map((col, i) => (
                          <SelectItem key={i} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome da Lista (identificação)</Label>
                    <Input
                      placeholder="Ex: Lista Maio 2026 - Porto"
                      value={listName}
                      onChange={(e) => setListName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Atribuir a Vendedor (ID, opcional)</Label>
                    <Input
                      type="number"
                      placeholder="Deixe vazio para distribuição automática"
                      value={assignTo}
                      onChange={(e) => setAssignTo(e.target.value)}
                    />
                  </div>
                </div>

                <Button
                  onClick={handleUpload}
                  disabled={!phoneCol || isUploading}
                  className="w-full gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {isUploading ? `A carregar ${rows.length} contactos...` : `Carregar ${rows.length} Contactos`}
                </Button>
              </>
            )}

            {!file && (
              <p className="text-xs text-muted-foreground">
                Origem padrão: <strong>Telemarketing</strong> | Formatos aceites: .xlsx, .xls, .csv
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
