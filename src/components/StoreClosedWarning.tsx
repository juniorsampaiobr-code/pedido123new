import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Clock } from "lucide-react";

export const StoreClosedWarning = () => {
  return (
    <Alert variant="destructive" className="mb-8">
      <Clock className="h-4 w-4" />
      <AlertTitle className="font-bold">Loja Fechada no Momento</AlertTitle>
      <AlertDescription>
        Não é possível adicionar itens ao carrinho ou fazer pedidos fora do nosso horário de funcionamento.
      </AlertDescription>
    </Alert>
  );
};