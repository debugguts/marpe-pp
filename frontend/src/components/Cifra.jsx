import Icono from './Icono'

// Tarjeta con un número grande y su título (saldo de caja, gastos del mes...).
// Rediseño S13: puede llevar un ícono en la esquina y una insignia abajo (cantidad, % del total).
// tono: "oscuro" (la principal), "salmon", "arena", "verde", "ocre" o "peligro" (por ejemplo, la caja cerrada).
// destacada equivale a tono="oscuro".
export default function Cifra({ titulo, valor, nota, destacada, tono, icono, insignia }) {
  const color = tono ?? (destacada ? 'oscuro' : null)
  return (
    <div className={`cifra-tarjeta${color ? ` is-${color}` : ''}`}>
      {icono && <span className="cifra-tarjeta__icono" aria-hidden="true"><Icono nombre={icono} tamano={18} /></span>}
      <p className="cifra-tarjeta__titulo">{titulo}</p>
      <p className="cifra-tarjeta__valor">{valor}</p>
      {nota && <p className="cifra-tarjeta__nota">{nota}</p>}
      {insignia && <p className="cifra-tarjeta__insignia">{insignia}</p>}
    </div>
  )
}
