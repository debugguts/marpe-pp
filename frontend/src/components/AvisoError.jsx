import Dialogo from './Dialogo'
import Icono from './Icono'
import { erroresDe } from '../lib/abm'

// Nombres que entiende el usuario para cada campo que puede mandar la API.
const CAMPOS = {
  general: '',
  detalles: 'Productos',
  cantidad: 'Cantidad',
  cliente: 'Cliente',
  modalidad: 'Forma de venta',
  medio_pago: 'Medio de pago',
  referencia_transferencia: 'Referencia de la transferencia',
  motivo: 'Motivo',
  importe: 'Importe',
  nombre: 'Nombre',
}

// Ventana que avisa con claridad por qué no se pudo guardar (dato incorrecto, sin stock, sin caja...).
// Recibe el error de la API tal cual y lo muestra campo por campo. Se cierra con «Entendido» o Escape.
export default function AvisoError({ error, titulo = 'No se pudo guardar', alCerrar }) {
  const errores = Object.entries(erroresDe(error))
  return (
    <Dialogo titulo={titulo} alCerrar={alCerrar}>
      <div className="dialogo__cuerpo aviso-error" role="alert">
        <span className="aviso-error__icono"><Icono nombre="alerta" tamano={28} /></span>
        <ul className="aviso-error__lista">
          {errores.map(([campo, texto]) => (
            <li key={campo}>
              {CAMPOS[campo] !== '' && <strong>{CAMPOS[campo] ?? campo}: </strong>}
              {texto}
            </li>
          ))}
        </ul>
      </div>
      <footer className="dialogo__pie">
        <button type="button" className="btn btn--primario" data-foco onClick={alCerrar}>Entendido</button>
      </footer>
    </Dialogo>
  )
}
