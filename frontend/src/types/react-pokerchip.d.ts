declare module "react-pokerchip" {
  import { FC } from "react";

  interface PokerChipProps {
    value?: number;
    text?: string;
    currency?: string;
    color?: string;
    lineColor?: string;
    size?: number;
    onClick?: () => void;
    disabled?: boolean;
  }

  const PokerChip: FC<PokerChipProps>;
  export default PokerChip;
}
