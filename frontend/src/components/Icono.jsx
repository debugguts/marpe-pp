// Iconos de línea (24×24). Siempre decorativos: el texto vecino da el nombre accesible.
const TRAZOS = {
  inicio: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z',
  ventas: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
  caja: 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M4 7V6a2 2 0 0 1 2-2h10 M16 13.5h.01',
  compras: 'M4 5h2l2 10h9l2-7H7 M10 19.5h.01 M16 19.5h.01',
  inventario: 'M12 3 4 7v10l8 4 8-4V7z M4 7l8 4 8-4 M12 11v10',
  gastos: 'M12 4v11 M7 11l5 5 5-5 M5 20h14',
  catalogo: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  clientes: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M3 20a6 6 0 0 1 12 0 M16 4.5a3.5 3.5 0 0 1 0 6.5 M18 14.5a6 6 0 0 1 3 5.5',
  proveedores: 'M3 6h11v10H3z M14 10h4l3 3v3h-7z M7 19.5h.01 M17 19.5h.01',
  usuarios: 'M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z M9.5 12l2 2 3.5-4',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  cerrar: 'M6 6l12 12 M18 6 6 18',
  chevron: 'm9 6 6 6-6 6',
  salir: 'M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4 M15 8l4 4-4 4 M19 12H9',
  mas: 'M12 5v14 M5 12h14',
  buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
  editar: 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4',
  archivar: 'M4 5h16v4H4z M5 9v10h14V9 M10 13h4',
  reactivar: 'M4 12a8 8 0 1 0 2.5-5.8 M4 4v4h4',
  cuentas: 'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h4',
  banco: 'M3 9.5 12 4l9 5.5 M5 10v7 M9.5 10v7 M14.5 10v7 M19 10v7 M3.5 20h17',
  alerta: 'M12 4 2.5 20h19z M12 10v4.5 M12 17.5h.01',
  reportes: 'M4 20h16 M7 16v-5 M12 16V7 M17 16v-8',
  imprimir: 'M7 9V4h10v5 M6 18H4v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7h-2 M7 14h10v6H7z',
  descargar: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  anular: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M5.6 5.6l12.8 12.8',
}

export default function Icono({ nombre, tamano = 20 }) {
  return (
    <svg
      className="icono"
      width={tamano}
      height={tamano}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={TRAZOS[nombre]} />
    </svg>
  )
}
