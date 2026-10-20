// Competition plate colours. Each routine day takes one in order,
// so "Day B" is always blue and easy to spot at a glance.
const DAY_PLATES = [
  { bg: 'var(--plate-red)', fg: '#FFFFFF', name: 'red' },
  { bg: 'var(--plate-blue)', fg: '#FFFFFF', name: 'blue' },
  { bg: 'var(--plate-yellow)', fg: '#15202E', name: 'yellow' },
  { bg: 'var(--plate-green)', fg: '#FFFFFF', name: 'green' },
  { bg: 'var(--plate-white)', fg: '#15202E', name: 'white' }
]

export function dayPlate (index) {
  if (index == null || index < 0) return { bg: 'var(--ink-3)', fg: '#FFFFFF', name: 'free' }
  return DAY_PLATES[index % DAY_PLATES.length]
}

export function plateStyle (index) {
  const p = dayPlate(index)
  return { '--plate-bg': p.bg, '--plate-fg': p.fg }
}

// Weight plates for the plate calculator (IWF colours for kg)
const KG = { 25: 'red', 20: 'blue', 15: 'yellow', 10: 'green', 5: 'white', 2.5: 'red', 2: 'blue', 1.5: 'yellow', 1.25: 'steel', 1: 'green', 0.5: 'white' }
const LB = { 45: 'blue', 35: 'yellow', 25: 'green', 10: 'white', 5: 'steel', 2.5: 'steel' }
const COLORS = {
  red: ['var(--plate-red)', '#FFFFFF'],
  blue: ['var(--plate-blue)', '#FFFFFF'],
  yellow: ['var(--plate-yellow)', '#15202E'],
  green: ['var(--plate-green)', '#FFFFFF'],
  white: ['var(--plate-white)', '#15202E'],
  steel: ['#9AA3AE', '#15202E']
}
export function weightPlateColors (weight, unit) {
  const name = (unit === 'lb' ? LB : KG)[weight] || 'steel'
  return COLORS[name]
}
