// Tarjeta con un número grande y su título (saldo de caja, gastos del mes...).
// tono="peligro" la pinta de rojo (por ejemplo, cuando la caja está cerrada).
export default function Cifra({ titulo, valor, nota, destacada, tono }) {
  return (
    <div className={`cifra-tarjeta${destacada ? ' is-destacada' : ''}${tono ? ` is-${tono}` : ''}`}>
      <p className="cifra-tarjeta__titulo">{titulo}</p>
      <p className="cifra-tarjeta__valor">{valor}</p>
      {nota && <p className="cifra-tarjeta__nota">{nota}</p>}
    </div>
  )
}
