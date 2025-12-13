import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Volume2 } from "lucide-react"

interface EnableSoundModalProps {
  isOpen: boolean;
  onEnable: () => void;
}

export const EnableSoundModal = ({ isOpen, onEnable }: EnableSoundModalProps) => {
  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Volume2 className="h-6 w-6 text-primary" />
            Ativar Notificações Sonoras?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Para garantir que você não perca nenhum novo pedido, precisamos da sua permissão para tocar um som de notificação.
            <br /><br />
            Ao clicar em "Ativar", um som de teste será reproduzido.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onEnable} className="w-full">
            Sim, ativar som
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}