# Lógica do Simulador Vodafone Repsol (extraída do HTML do utilizador)

## Configuração de Preços Base (editáveis pelo CE/CO):
- Base Energia (€/kWh): 0.1850
- Fixo 3.45kVA (€/dia): 0.2918
- Fixo 4.6kVA (€/dia): 0.4491
- Fixo 6.9kVA (€/dia): 0.5636
- Gás Escalão 1 Fixo: 0.1746 | Energia: 0.112825
- Gás Escalão 2 Fixo: 0.2087 | Energia: 0.108733

## Modo: Só Eletricidade OU Eletricidade + Gás (Dual)

## Inputs do Cliente:
- Consumo Luz (kWh)
- Potência Contratada (3.45 / 4.60 / 6.90 kVA)
- Preço Atual Energia (€/kWh)
- Preço Atual Fixo (€/dia)
- Se Dual: Consumo Gás (kWh), Escalão, Preço Atual Gás, Preço Fixo Gás
- Litros combustível abastecidos por mês

## Descontos (checkboxes):
- 5% Desconto Repsol (base)
- 3% Desconto Parceria Vodafone
- 2% Fatura Eletrónica
- 8% Débito Direto
- 5% Serviços de Apoio (opcional)
Total máximo: 23% (5+3+2+8+5)

## Cálculo:
- Fatura Atual = (Preço Atual kWh × Consumo) + (Preço Fixo Atual × 30 dias)
- Fatura Repsol = (Base kWh × (1 - desconto%) × Consumo) + (Fixo Repsol × 30 dias)
- Poupança Fatura = Atual - Repsol

## Extras:
- Combustível: litros × 0.20€ (20 cênt/litro)
- Cashback My Repsol: 2% da fatura (Só Luz) ou 3% (Dual)
- Oferta Adesão: -5€/mês (Luz) ou -10€/mês (Dual) nos primeiros 3 meses

## Poupança Total Anual = (Poupança Fatura + Cashback + Combustível) × 12
