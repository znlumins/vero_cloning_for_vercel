// c:\laragon\www\vero_learning_management_system\app\utils\models.d.ts

declare module '@/app/utils/modelbisindo' {
  export function score(features: number[]): number[] | Record<number, number>;
}

declare module '@/app/utils/modelsibi' {
  export function score(features: number[]): number[] | Record<number, number>;
}

declare module '../../../utils/modelbisindo' {
  export function score(features: number[]): number[] | Record<number, number>;
}

declare module '../../../utils/modelsibi' {
  export function score(features: number[]): number[] | Record<number, number>;
}
