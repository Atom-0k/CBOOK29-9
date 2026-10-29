import { EnviarNotaForm } from "../../components/forms/EnviarNotaForm";
import { CURRENT_ASIGNACIONES } from "../../data/mock";

export function EnviarNotaView() {
  return <EnviarNotaForm cursos={CURRENT_ASIGNACIONES} />;
}
