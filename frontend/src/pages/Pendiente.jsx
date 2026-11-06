import { Link } from 'react-router-dom'
import { CabeceraPagina, EstadoVacio } from '../components/ui'

export function Pendiente({ titulo, icono, texto }) {
  return (
    <>
      <CabeceraPagina titulo={titulo} />
      <EstadoVacio icono={icono} titulo="Pantalla en construcción" texto={texto} />
    </>
  )
}

export function NoEncontrada() {
  return (
    <>
      <CabeceraPagina titulo="Página no encontrada" />
      <EstadoVacio
        icono="inicio"
        titulo="Esta dirección no existe"
        texto="Revisá que esté bien escrita o volvé al inicio."
      >
        <Link to="/" className="btn btn--primario">Ir al inicio</Link>
      </EstadoVacio>
    </>
  )
}
