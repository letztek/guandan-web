import { defaultPartnerId, partners, type PartnerId } from './partner-roster.ts'

const [hanakomachi, waitress, athena] = partners
const positions = [
  { number: 3, occupant: waitress, x: -1.10, z: -.31, yaw: 1.03 },
  { number: 2, occupant: hanakomachi, x: 0, z: -.81, yaw: -.06 },
  { number: 1, occupant: athena, x: 1.10, z: -.31, yaw: -1.03 },
] as const

export function tableSeatsFor(partnerId: PartnerId = defaultPartnerId) {
  const partner = partners.find(person => person.id === partnerId) ?? hanakomachi
  return positions.map(({ occupant, ...position }) => {
    let person = occupant
    if (position.number === 2) person = partner
    else if (occupant.id === partner.id) person = hanakomachi
    return { ...position, name: person.name, model: person.rig, portrait: person.portrait, playStyle: person.playStyle }
  })
}

export function characterName(seat: number, partnerId: PartnerId = defaultPartnerId) {
  return tableSeatsFor(partnerId).find(person => person.number === seat)?.name ?? '你'
}

export function playStyleForSeat(seat: number, partnerId: PartnerId) {
  const coachSeat = seat === 0 ? 2 : seat
  const person = tableSeatsFor(partnerId).find(person => person.number === coachSeat)
  if (!person) throw new RangeError(`Unknown seat: ${seat}`)
  return person.playStyle
}
