import { CSSProperties, FC } from 'react';

export interface LineWavesProps {
  color1?: string;
  color2?: string;
  color3?: string;
  colorCycleSpeed?: number;
  speed?: number;
  lineCount?: number;
  lineWidth?: number;
  glow?: number;
  brightness?: number;
  highlight?: number;
  highlightWidth?: number;
  warpIntensity?: number;
  warpScale?: number;
  rotation?: number;
  edgeFade?: number;
  enableMouseInteraction?: boolean;
  mouseInfluence?: number;
  clickRipple?: boolean;
  intro?: boolean;
  lightMode?: boolean;
  opacity?: number;
  maxDevicePixelRatio?: number;
  className?: string;
  style?: CSSProperties;
}

declare const LineWaves: FC<LineWavesProps>;
export default LineWaves;

