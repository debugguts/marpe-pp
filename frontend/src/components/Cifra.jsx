// Tarjeta con un número grande y su título (saldo de caja, gastos del mes...).
export default function Cifra({ titulo, valor, nota, destacada }) {
  return (
    <div className={`cifra-tarjeta${destacada ? ' is-destacada' : ''}`}>
      <p className="cifra-tarjeta__titulo">{titulo}</p>
      <p className="cifra-tarjeta__valor">{valor}</p>
      {nota && <p className="cifra-tarjeta__nota">{nota}</p>}
    </div>
  )
}
