import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Gauge,
  Headset,
  Lock,
  Mail,
  Radio,
  Smartphone,
  Wifi,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** Decoração de fundo: ondas de cobertura e linhas “rede / fibra”. */
function TelecomHeroBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Ondas de cobertura / sinal */}
      <svg className="absolute -right-24 top-8 h-[420px] w-[420px] opacity-[0.12]" viewBox="0 0 200 200">
        {[175, 140, 105, 70, 35].map((r, i) => (
          <circle
            key={r}
            cx="80"
            cy="100"
            r={r}
            fill="none"
            stroke="white"
            strokeWidth="1"
            opacity={0.5 + i * 0.1}
          />
        ))}
      </svg>
      <svg className="absolute -left-32 bottom-0 h-[520px] w-[520px] opacity-[0.08]" viewBox="0 0 200 200">
        {[180, 145, 110, 75, 40].map((r, i) => (
          <circle
            key={r}
            cx="100"
            cy="140"
            r={r}
            fill="none"
            stroke="white"
            strokeWidth="1"
            opacity={0.4 + i * 0.12}
          />
        ))}
      </svg>
      {/* Traços estilo rede / fibra */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.15]"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="fiberGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,120 Q180,40 400,180 T800,80"
          fill="none"
          stroke="url(#fiberGlow)"
          strokeWidth="2"
        />
        <path
          d="M-50,200 Q200,100 500,220 T900,140"
          fill="none"
          stroke="white"
          strokeWidth="1"
          opacity="0.3"
        />
      </svg>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.25)_100%)]" />
    </div>
  );
}

const featureItems = [
  {
    icon: Wifi,
    label: "Internet & fibra",
    sub: "Propostas e follow-up de banda larga",
  },
  {
    icon: Smartphone,
    label: "Telemóvel & pacotes",
    sub: "Venda de serviços e retenção",
  },
  {
    icon: Headset,
    label: "Contacto comercial",
    sub: "Chamadas, campanhas e pendentes",
  },
  {
    icon: Gauge,
    label: "Ritmo de equipa",
    sub: "Dashboard e metas em tempo real",
  },
] as const;

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = trpc.authLocal.login.useMutation({
    onSuccess: () => {
      toast.success("Bem-vindo de volta.");
      window.location.href = "/painel";
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "E-mail ou senha incorretos");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Preencha o e-mail e a senha");
      return;
    }
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 lg:flex-row">
      {/* Painel esquerdo — tema telecom / retalho */}
      <div className="relative flex min-h-[42vh] flex-1 flex-col justify-center overflow-hidden lg:min-h-screen lg:max-w-[52%]">
        <div className="absolute inset-0 bg-[linear-gradient(145deg,#5a0000_0%,#e60000_42%,#9a0000_100%)]" />
        <TelecomHeroBackground />

        <div className="relative z-10 px-8 py-10 text-white lg:px-14 lg:py-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-lg"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-white/90 ring-1 ring-white/20 backdrop-blur-sm">
              <Radio className="h-3.5 w-3.5" aria-hidden />
              CRM comercial telecom
            </div>
            <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight md:text-4xl lg:text-[2.35rem]">
              Venda de serviços de{" "}
              <span className="text-white drop-shadow-sm">telefone e internet</span>
            </h1>
            <p className="mt-4 max-w-md text-pretty text-base leading-relaxed text-white/85 md:text-lg">
              A mesma energia do retalho de telecomunicações: rapidez na abordagem, clareza na
              oferta e acompanhamento de contactos, campanhas e fechos.
            </p>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.45 }}
            className="mt-10 grid max-w-lg grid-cols-2 gap-3 sm:gap-4"
          >
            {featureItems.map(({ icon: Icon, label, sub }, i) => (
              <motion.li
                key={label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.06, duration: 0.35 }}
                className="rounded-xl border border-white/15 bg-white/10 p-3.5 backdrop-blur-md sm:p-4"
              >
                <Icon className="mb-2 h-5 w-5 text-white/95" strokeWidth={1.75} aria-hidden />
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="mt-0.5 text-xs leading-snug text-white/70">{sub}</p>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex flex-1 flex-col justify-center bg-white px-6 py-10 shadow-[inset_0_1px_0_0_rgba(0,0,0,0.04)] lg:px-12 lg:py-16">
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-[400px]"
        >
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Início de sessão
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900 md:text-[1.65rem]">
              Entrar na Área Reservada
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              Aceda ao painel para gerir operações comerciais, contactos e propostas.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 p-6 shadow-sm md:p-7">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-neutral-700">
                  E-mail profissional
                </Label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400"
                    aria-hidden
                  />
                  <Input
                    id="email"
                    type="email"
                    placeholder="nome@empresa.pt"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="h-11 border-neutral-200 bg-white pl-10 text-neutral-900 placeholder:text-neutral-400 focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[#e60000]/35"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-neutral-700">
                  Senha
                </Label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-neutral-400"
                    aria-hidden
                  />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-11 border-neutral-200 bg-white pl-10 text-neutral-900 placeholder:text-neutral-400 focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-[#e60000]/35"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={loginMutation.isPending}
                className="group h-11 w-full rounded-lg bg-[#e60000] text-[15px] font-semibold text-white shadow-md transition hover:bg-[#cc0000] hover:opacity-[0.98] disabled:opacity-70"
              >
                <span className="flex items-center justify-center gap-2">
                  {loginMutation.isPending ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  ) : (
                    <>
                      Entrar no painel
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </>
                  )}
                </span>
              </Button>
            </form>
          </div>

          <p className="mt-8 text-center text-xs leading-relaxed text-neutral-500">
            Ligação segura. Em caso de dúvida sobre acesso, contacte o administrador da equipa.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
