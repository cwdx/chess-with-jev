// How a finished game is named: who beat whom, or who drew.
import type { Seat } from './games'

type Colour = 'white' | 'black'
const NAME: Record<Seat, string> = { human: 'a person', jev: 'Jev', simple: 'the simple engine' }
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1)

/** "Jev beat the simple engine." / "White (Jev) beat Black (Jev)." / "A draw between Jev and a person." */
export function gameHeadline(white: Seat, black: Seat, winner?: Colour): string {
  // the same player on both sides is told apart by colour
  const name = (c: Colour) => {
    const seat = c === 'white' ? white : black
    return white === black ? `${cap(c)} (${NAME[seat]})` : NAME[seat]
  }
  if (!winner) return `A draw between ${name('white')} and ${name('black')}.`
  return `${cap(name(winner))} beat ${name(winner === 'white' ? 'black' : 'white')}.`
}
