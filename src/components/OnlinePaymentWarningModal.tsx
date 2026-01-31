import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertCircle, CreditCard } from "lucide-react"

interface OnlinePaymentWarningModalProps {
  isOpen: boolean;
  onConfirm: () => void;
}

export const OnlinePaymentWarningModal = ({ isOpen, onConfirm }: OnlinePaymentWarningModalProps) => {
  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-primary">
            <AlertCircle className="h-6 w-6" />
            Atenção ao Pagamento Online!
          </AlertDialogTitle>
          <AlertDialogDescription>
            Você escolheu o pagamento online (Pix ou Cartão).
            <br /><br />
            Ao prosseguir, você será redirecionado para o checkout seguro do Mercado Pago.
            <br /><br />
            **IMPORTANTE:** Se você escolher **PIX**, após o pagamento, você pode precisar clicar no botão **"Voltar ao site"** na tela do Mercado Pago para que seu pedido seja finalizado e rastreado corretamente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onConfirm} className="w-full">
            Entendi e Continuar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}