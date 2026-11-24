// Categorías de gasto con su color fijo (rediseño S13, pedido del cliente) y el tipo que se sugiere al elegirlas.
// El negocio trabaja en la feria (sin local): «Alquiler» pasó a llamarse «Feria / Puesto». Los gastos
// viejos guardados como «Alquiler» se muestran y se cuentan como Feria / Puesto, sin tocar la base.
export const CATEGORIAS_GASTO = [
  { nombre: 'Feria / Puesto', color: 'var(--cat-feria)', tipo: 'FIJO', alias: ['alquiler', 'feria', 'puesto'] },
  { nombre: 'Sueldos', color: 'var(--cat-sueldos)', tipo: 'FIJO' },
  { nombre: 'Combustible', color: 'var(--cat-combustible)', tipo: 'VARIABLE' },
  { nombre: 'Servicios', color: 'var(--cat-servicios)', tipo: 'FIJO' },
  { nombre: 'Insumos', color: 'var(--cat-insumos)', tipo: 'VARIABLE' },
  { nombre: 'Mantenimiento', color: 'var(--cat-mantenimiento)', tipo: 'VARIABLE' },
  { nombre: 'Otros', color: 'var(--cat-otros)', tipo: 'VARIABLE' },
]

const simple = (t) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

// La categoría oficial de un gasto (por nombre o alias). Lo que no coincide cuenta como «Otros».
export function categoriaDe(nombre) {
  const t = simple(nombre)
  return CATEGORIAS_GASTO.find((c) => simple(c.nombre) === t || c.alias?.some((a) => t.startsWith(a)))
    ?? CATEGORIAS_GASTO.at(-1)
}
