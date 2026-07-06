// Carried over from Animalian Manor's combat system (src/data/combat.js).
export const TYPES = ['ember', 'tide', 'thorn', 'storm', 'phantom', 'iron']

export function getTypeMultiplier(attackType, defenderType, defenderDualType = null) {
  function singleMult(aType, dType) {
    if (dType === 'phantom') return 1.25
    if (aType === 'phantom') return 1.25
    if (aType === 'iron') return 1.0
    const chart = {
      ember: { strong: 'thorn', weak: 'tide' },
      tide: { strong: 'ember', weak: 'storm' },
      thorn: { strong: 'tide', weak: 'ember' },
      storm: { strong: 'tide', weak: 'thorn' },
    }
    const row = chart[aType]
    if (!row) return 1.0
    if (row.strong === dType) return 1.5
    if (row.weak === dType) return 0.75
    return 1.0
  }
  const primaryMult = singleMult(attackType, defenderType)
  if (!defenderDualType) return primaryMult
  return Math.min(primaryMult, singleMult(attackType, defenderDualType))
}
