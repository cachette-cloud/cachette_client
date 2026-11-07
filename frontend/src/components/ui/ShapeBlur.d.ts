import { CSSProperties, FC, ReactNode } from 'react';

export interface ShapeBlurProps {
  shape?: 'rect' | 'circle' | 'polygon' | 'star';
  src?: string;
  sides?: number;
  size?: number;
  roundness?: number;
  thickness?: number;
  fill?: boolean;
  echoes?: number;
  spacing?: number;
  color?: string;
  blur?: number;
  lensSize?: number;
  lensSoftness?: number;
  focus?: boolean;
  chroma?: number;
  rotation?: number;
  spin?: number;
  idle?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

declare const ShapeBlur: FC<ShapeBlurProps>;
export default ShapeBlur;

