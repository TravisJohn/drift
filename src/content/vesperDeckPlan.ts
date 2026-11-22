/**
 * Vesper Station service deck - the approved deck plan as data (D4).
 *
 * Survey coordinates match docs/maps/Vesper-Station.png: 16 rooms and 26
 * corridors on a 1184 x 908 deck. Each room is an
 * octagon (a rectangle with 12-unit chamfers) centred on (x, y). A corridor
 * runs from room `a`'s centre through its bend points to room `b`'s centre.
 *
 * src/salvage/vesperDeck.ts turns this into walls, sight and patrol routes.
 */

export interface DeckRoom {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly name: string;
}

export interface DeckHallSpec {
  readonly a: string;
  readonly b: string;
  /** Bend points between the two room centres, in order from a to b. */
  readonly bends: readonly (readonly [number, number])[];
}

export interface PatrolSpec {
  readonly kind?: 'hunter';
  /** Rooms visited in order; the circuit closes back to the first. */
  readonly rooms: readonly string[];
  /** Units per second. */
  readonly speed: number;
  /** Starting phase around the circuit, 0..1. */
  readonly offset: number;
}

/** The destination (content/destinations.ts) whose deck this is. */
export const VESPER_LOCATION_ID = 'vesper';

/** The deck's survey size. */
export const DECK_WIDTH = 1184;
export const DECK_HEIGHT = 908;

/** The room the drone starts and unloads in. */
export const AIRLOCK_ID = 'air';

const room = (x: number, y: number, width: number, height: number, name: string): DeckRoom => ({
  x,
  y,
  width,
  height,
  name,
});

export const deckRooms: Readonly<Record<string, DeckRoom>> = {
  air: room(100, 548, 124, 83, 'Docking airlock'),
  receiving: room(263, 548, 137, 86, 'Receiving'),
  crew: room(337, 326, 153, 99, 'Crew quarters'),
  hydro: room(600, 231, 170, 102, 'Hydroponics'),
  filter: room(491, 356, 115, 78, 'Filtration'),
  hub: room(626, 453, 152, 105, 'Relay hub'),
  med: room(881, 315, 146, 96, 'Med bay'),
  cargo: room(1050, 471, 153, 98, 'Cargo hold'),
  switchyard: room(844, 510, 151, 94, 'Switchyard'),
  bank: room(1048, 675, 176, 104, 'Capacitor bank'),
  converter: room(824, 684, 152, 87, 'Converter'),
  pump: room(838, 832, 150, 82, 'Pump house'),
  stores: room(570, 823, 180, 105, 'Reserve stores'),
  shop: room(344, 740, 152, 94, 'Machine shop'),
  coolant: room(610, 639, 155, 104, 'Coolant plant'),
  sorting: room(419, 517, 145, 94, 'Sorting hall'),
};

const hall = (a: string, b: string, ...bends: [number, number][]): DeckHallSpec => ({
  a,
  b,
  bends,
});

export const deckHalls: readonly DeckHallSpec[] = [
  hall('air', 'receiving'),
  hall('receiving', 'crew', [263, 400]),
  hall('crew', 'sorting', [337, 416], [419, 471]),
  hall('sorting', 'receiving', [344, 517], [313, 548]),
  hall('crew', 'hydro', [415, 248], [498, 248]),
  hall('hydro', 'filter', [555, 305]),
  hall('filter', 'hub', [474, 389], [529, 453]),
  hall('hub', 'hydro', [626, 325], [600, 299]),
  hall('hub', 'med', [713, 417], [789, 339]),
  hall('med', 'cargo', [964, 315], [1050, 402]),
  hall('cargo', 'switchyard', [962, 471], [907, 510]),
  hall('switchyard', 'med', [844, 399], [881, 363]),
  hall('cargo', 'bank', [1133, 529], [1133, 611]),
  hall('bank', 'converter'),
  hall('converter', 'pump', [824, 756]),
  hall('pump', 'bank', [937, 832], [1048, 733]),
  hall('stores', 'pump', [680, 858], [776, 858]),
  hall('shop', 'stores', [426, 823]),
  hall('stores', 'coolant', [570, 747], [610, 705]),
  hall('coolant', 'shop', [481, 639], [384, 740]),
  hall('receiving', 'shop', [263, 660]),
  hall('sorting', 'hub', [501, 517], [555, 472]),
  hall('hub', 'switchyard', [722, 453], [781, 510]),
  hall('switchyard', 'converter', [844, 596], [824, 625]),
  hall('converter', 'coolant', [739, 684], [685, 639]),
  hall('coolant', 'sorting', [557, 639], [473, 556]),
];

/** Rooms holding an energy cell socket (two are enough to complete the mission). */
export const cellRoomIds: readonly string[] = ['hydro', 'bank', 'stores'];

/** Socket position relative to its room's centre. */
export const SOCKET_OFFSET = { x: 28, y: -23 } as const;

export const patrolSpecs: readonly PatrolSpec[] = [
  { rooms: ['receiving', 'crew', 'sorting'], speed: 20, offset: 0.24 },
  { rooms: ['hydro', 'filter', 'hub'], speed: 19, offset: 0.49 },
  { rooms: ['med', 'cargo', 'switchyard'], speed: 24, offset: 0.19 },
  { rooms: ['bank', 'converter', 'pump'], speed: 21, offset: 0.53 },
  { rooms: ['shop', 'stores', 'coolant'], speed: 20, offset: 0.76 },
  { rooms: ['sorting', 'hub', 'switchyard', 'converter', 'coolant'], speed: 26, offset: 0.67 },
  // Hunters sweep the corridors between objectives. Regular patrols still inspect the sockets.
  { kind: 'hunter', rooms: ['hub', 'med', 'switchyard'], speed: 22, offset: 0.36 },
  { kind: 'hunter', rooms: ['sorting', 'coolant', 'shop', 'receiving'], speed: 18, offset: 0.42 },
];
