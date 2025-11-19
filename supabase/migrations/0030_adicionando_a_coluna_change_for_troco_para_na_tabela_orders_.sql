ALTER TABLE public.orders
ADD COLUMN change_for NUMERIC NULL;

-- Adicionando trigger de updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.orders;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();