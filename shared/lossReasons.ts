export const LOSS_REASONS = [
  { value: "preco", label: "Preço elevado" },
  { value: "fidelizacao", label: "Fidelização com outro operador" },
  { value: "sem_cobertura", label: "Sem cobertura na zona" },
  { value: "satisfeito_atual", label: "Satisfeito com o atual" },
  { value: "sem_interesse", label: "Sem interesse no momento" },
  { value: "nao_decide", label: "Não é quem decide" },
  { value: "mau_timing", label: "Mau timing / ocupado" },
  { value: "experiencia_negativa", label: "Experiência negativa anterior" },
  { value: "outro", label: "Outro motivo" },
] as const;

export type LossReason = typeof LOSS_REASONS[number]["value"];
