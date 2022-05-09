/** Testing members of classes, interfaces, and type literals / object types. */

export declare var value: {
  property: string;
  get getter(): number;
  // set xx(value: number); // TODO -> ditto plus `: void`

  method1(): void;
  method2(x: number): string;
  functionProperty: (x: number) => string;

  destructuringMethod({ x }: { x: number }): void;
};

export declare class C {
  constructor(); // TODO: should return void, not any

  f(cb: (s: string) => void): void;
  g(other: this): this;
  // 'import'(cb: (s: string) => void): this;  // TS supports this, but Flow has no equivalent.

  get getter(): number;

  x;
  y: this;
  z?;
  w?: number;
  // TODO implement
  // 3: string;
  // 'extends': string;
  // [3]: string;
  // ['extends']: string;
}

export declare interface I {
  f(cb: (s: string) => void): void;

  x;
  z?;
  w?: number;

  get getter(): number;
}
