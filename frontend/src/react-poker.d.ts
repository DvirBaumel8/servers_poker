declare module 'react-poker' {
  
  interface DeckProps {
    board: string[]
    boardXoffset?: number
    boardYoffset?: number
    size?: number
  }

  const Deck: React.FC<DeckProps>
  export default Deck
}
