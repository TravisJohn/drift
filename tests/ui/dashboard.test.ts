import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { locations } from '../../src/content/destinations';
import { shipLayout } from '../../src/content/shipLayout';
import { VESSEL_NAME, roomReadouts } from '../../src/content/shipSystems';
import { PlayerMode } from '../../src/state/playerMode';
import { drawStarChart } from '../../src/ui/dashboard/starChart';
import { type DashboardInput, buildDashboardData, cssColor } from '../../src/ui/dashboardModel';
import { type DashboardCallbacks, DashboardOverlay } from '../../src/ui/dashboardOverlay';

const input = (over: Partial<DashboardInput> = {}): DashboardInput => ({
  rooms: shipLayout.rooms,
  podCount: 4,
  phase: 'docked',
  progress: 0,
  places: locations,
  locationId: 'anchorage',
  destinationId: null,
  cruiseScale: 1,
  training: [{ id: 'placeholder', title: 'Training console' }],
  ...over,
});
const value = (
  rows: readonly { label: string; value: string }[],
  label: string,
): string | undefined => rows.find((r) => r.label === label)?.value;

describe('buildDashboardData: status readouts', () => {
  it('names the vessel and lists every compartment with its readout', () => {
    const data = buildDashboardData(input());
    expect(data.vessel).toBe(VESSEL_NAME);
    expect(data.rooms.map((r) => r.id)).toEqual(shipLayout.rooms.map((r) => r.id));
    for (const room of data.rooms) expect(room.detail.length).toBeGreaterThan(10);
  });

  it('every room in the layout has a readout written for it', () => {
    for (const room of shipLayout.rooms) expect(roomReadouts[room.id]).toBeTruthy();
  });

  it('docked: shows where the ship is and that no course is set', () => {
    const data = buildDashboardData(input());
    expect(value(data.journey, 'Status')).toBe('Docked');
    expect(value(data.journey, 'Location')).toBe('Anchorage Point');
    expect(value(data.journey, 'Course')).toBe('None set');
    expect(value(data.systems, 'Autopilot')).toBe('Standby');
    expect(value(data.systems, 'Reactor')).toBe('Low burn');
  });

  it('cruising: shows origin, destination and progress, with autopilot engaged', () => {
    const data = buildDashboardData(
      input({ phase: 'cruising', progress: 0.426, destinationId: 'aurelia' }),
    );
    expect(value(data.journey, 'Status')).toBe('Cruising');
    expect(value(data.journey, 'From')).toBe('Anchorage Point');
    expect(value(data.journey, 'To')).toBe('Aurelia');
    expect(value(data.journey, 'Progress')).toBe('43%');
    expect(value(data.systems, 'Autopilot')).toBe('Engaged');
    expect(value(data.systems, 'Reactor')).toBe('Cruise burn');
  });

  it('departure and arrival are shown as manoeuvres, not as a percentage', () => {
    const departing = buildDashboardData(input({ phase: 'departing', destinationId: 'cinder' }));
    expect(value(departing.journey, 'Progress')).toBe('Departing');
    const arriving = buildDashboardData(input({ phase: 'arriving', destinationId: 'cinder' }));
    expect(value(arriving.journey, 'Progress')).toBe('Arriving');
  });

  it('counts the cryo pods it is told about, with correct grammar', () => {
    expect(value(buildDashboardData(input()).systems, 'Cryo')).toBe('4 pods · stable');
    expect(value(buildDashboardData(input({ podCount: 1 })).systems, 'Cryo')).toBe(
      '1 pod · stable',
    );
  });

  it('passes training modules through untouched (the AWS entry point)', () => {
    const training = [
      { id: 'a', title: 'S3 basics' },
      { id: 'b', title: 'SageMaker pipelines' },
    ];
    expect(buildDashboardData(input({ training })).training).toEqual(training);
  });

  it('fails loud on a place it does not know (content error, not a blank screen)', () => {
    expect(() => buildDashboardData(input({ locationId: 'nowhere' }))).toThrow(/unknown place/);
  });
});

describe('buildDashboardData: navigation (set course from the dashboard)', () => {
  it('docked: a course can be set, to every place but the one the ship is at', () => {
    const nav = buildDashboardData(input()).navigation;
    expect(nav.canSetCourse).toBe(true);
    expect(nav.here.id).toBe('anchorage');
    expect(nav.destinations.map((d) => d.id)).toEqual(['aurelia', 'cinder']);
    expect(nav.courseId).toBeNull();
    expect(nav.shipAt).toEqual(nav.here.chart);
  });

  it('shows travel times as this run will take them (cruise scale applied)', () => {
    const nav = buildDashboardData(input({ cruiseScale: 0.5 })).navigation;
    expect(nav.destinations.find((d) => d.id === 'aurelia')?.etaSeconds).toBe(45);
  });

  it('underway: the course is locked and the ship moves along the route', () => {
    const at = (phase: DashboardInput['phase'], progress: number) =>
      buildDashboardData(input({ phase, progress, destinationId: 'aurelia' })).navigation;
    const aurelia = locations.find((l) => l.id === 'aurelia')!;
    const anchorage = locations.find((l) => l.id === 'anchorage')!;
    expect(at('cruising', 0.5).canSetCourse).toBe(false);
    expect(at('cruising', 0.5).courseId).toBe('aurelia');
    expect(at('departing', 0).shipAt).toEqual(anchorage.chart);
    expect(at('cruising', 0.5).shipAt.x).toBeCloseTo((anchorage.chart.x + aurelia.chart.x) / 2, 9);
    expect(at('arriving', 1).shipAt).toEqual(aurelia.chart);
    expect(at('cruising', 0.5).status).toContain('Aurelia');
  });

  it('turns content colours into CSS colours', () => {
    expect(cssColor(0x7fd4e8)).toBe('#7fd4e8');
    expect(cssColor(0x00000f)).toBe('#00000f');
  });

  it('offers the exterior camera', () => {
    expect(buildDashboardData(input()).cameras.map((c) => c.id)).toEqual(['exterior']);
  });
});

describe('drawStarChart', () => {
  const nav = buildDashboardData(input()).navigation;
  const marks = (svg: SVGSVGElement) =>
    [...svg.querySelectorAll('.place')].map((g) => g.getAttribute('data-id'));

  it('marks every known place, with the ship on the chart', () => {
    const svg = drawStarChart(nav, null);
    expect(marks(svg).sort()).toEqual(['anchorage', 'aurelia', 'cinder']);
    expect(svg.querySelector('.ship-marker')).not.toBeNull();
  });

  it('draws a dashed route to the destination being considered, and none without one', () => {
    expect(drawStarChart(nav, null).querySelector('.route')).toBeNull();
    const route = drawStarChart(nav, 'cinder').querySelector('.route');
    expect(route?.classList.contains('locked')).toBe(false);
  });

  it('draws the course as a locked route while underway', () => {
    const underway = buildDashboardData(
      input({ phase: 'cruising', progress: 0.3, destinationId: 'cinder' }),
    ).navigation;
    expect(drawStarChart(underway, null).querySelector('.route.locked')).not.toBeNull();
  });
});

describe('DashboardOverlay', () => {
  let overlay: DashboardOverlay;
  let callbacks: {
    onRoomSelected: Mock<DashboardCallbacks['onRoomSelected']>;
    onSetCourse: Mock<DashboardCallbacks['onSetCourse']>;
    onExteriorView: Mock<DashboardCallbacks['onExteriorView']>;
    onCombat: Mock<DashboardCallbacks['onCombat']>;
    onTraining: Mock<DashboardCallbacks['onTraining']>;
    onClose: Mock<DashboardCallbacks['onClose']>;
  };
  const press = (code: string, repeat = false): void => {
    document.dispatchEvent(new KeyboardEvent('keydown', { code, repeat }));
  };
  const visible = (): HTMLElement =>
    document.querySelector('#dashboard .tab-panel:not([hidden])') as HTMLElement;
  const selected = (): string | null =>
    visible().querySelector('.item.selected')?.textContent ?? null;

  beforeEach(() => {
    overlay = new DashboardOverlay();
    callbacks = {
      onRoomSelected: vi.fn<DashboardCallbacks['onRoomSelected']>(),
      onSetCourse: vi.fn<DashboardCallbacks['onSetCourse']>(),
      onExteriorView: vi.fn<DashboardCallbacks['onExteriorView']>(),
      onCombat: vi.fn<DashboardCallbacks['onCombat']>(),
      onTraining: vi.fn<DashboardCallbacks['onTraining']>(),
      onClose: vi.fn<DashboardCallbacks['onClose']>(),
    };
    overlay.open(buildDashboardData(input()), callbacks);
  });

  afterEach(() => {
    overlay.close();
  });

  it('shows the vessel, live readouts and the five tabs', () => {
    const text = document.getElementById('dashboard')?.textContent ?? '';
    expect(text).toContain(VESSEL_NAME);
    expect(text).toContain('Anchorage Point');
    const tabs = [...document.querySelectorAll('#dashboard .tab')].map((t) => t.textContent);
    expect(tabs).toEqual(['1Navigation', '2Cameras', '3Ship', '4Tactical', '5Training']);
  });

  it('opens on navigation, with no compartment lit on the hologram', () => {
    expect(overlay.activeTab).toBe('navigation');
    expect(visible().querySelector('.star-chart')).not.toBeNull();
    expect(callbacks.onRoomSelected).toHaveBeenLastCalledWith(null);
  });

  it('Enter engages the chosen destination and keeps the dashboard open', () => {
    press('ArrowDown');
    press('Enter');
    expect(callbacks.onSetCourse).toHaveBeenCalledWith('cinder');
    expect(overlay.isOpen).toBe(true);
  });

  it('the Engage button names the destination and sets the course', () => {
    const engage = visible().querySelector('.engage') as HTMLButtonElement;
    expect(engage.textContent).toContain('Aurelia');
    engage.click();
    expect(callbacks.onSetCourse).toHaveBeenCalledWith('aurelia');
  });

  it('underway the course is locked: nothing to engage, the button says why', () => {
    overlay.update(
      buildDashboardData(input({ phase: 'cruising', progress: 0.2, destinationId: 'aurelia' })),
    );
    press('ArrowDown');
    press('Enter');
    expect(callbacks.onSetCourse).not.toHaveBeenCalled();
    const engage = visible().querySelector('.engage') as HTMLButtonElement;
    expect(engage.disabled).toBe(true);
    expect(engage.textContent).toBe('Autopilot engaged');
    expect(selected()).toContain('Aurelia');
  });

  it('number keys, arrows and clicks switch tabs', () => {
    press('Digit3');
    expect(overlay.activeTab).toBe('ship');
    press('ArrowRight');
    expect(overlay.activeTab).toBe('tactical');
    press('ArrowRight');
    expect(overlay.activeTab).toBe('training');
    press('ArrowRight');
    expect(overlay.activeTab).toBe('navigation');
    (document.querySelectorAll('#dashboard .tab')[1] as HTMLElement).click();
    expect(overlay.activeTab).toBe('cameras');
  });

  it('the cameras tab takes the player outside, closing the dashboard first', () => {
    press('Digit2');
    press('Enter');
    expect(callbacks.onExteriorView).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(overlay.isOpen).toBe(false);
  });

  it('the ship tab lights the first compartment and arrows move through them, wrapping', () => {
    press('Digit3');
    expect(selected()).toBe(shipLayout.rooms[0]?.name);
    expect(callbacks.onRoomSelected).toHaveBeenLastCalledWith(shipLayout.rooms[0]?.id);
    press('ArrowDown');
    expect(callbacks.onRoomSelected).toHaveBeenLastCalledWith(shipLayout.rooms[1]?.id);
    const second = shipLayout.rooms[1];
    if (!second) throw new Error('layout needs at least two rooms');
    expect(visible().querySelector('.detail')?.textContent).toBe(roomReadouts[second.id]);
    press('ArrowUp');
    press('ArrowUp');
    expect(selected()).toBe(shipLayout.rooms[shipLayout.rooms.length - 1]?.name);
  });

  it('leaving the ship tab clears the hologram highlight', () => {
    press('Digit3');
    press('Digit1');
    expect(callbacks.onRoomSelected).toHaveBeenLastCalledWith(null);
  });

  it('T starts training from any tab and closes, without also reporting a close', () => {
    press('KeyT');
    expect(callbacks.onTraining).toHaveBeenCalledWith('placeholder');
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(overlay.isOpen).toBe(false);
  });

  it('clicking a training module starts that module', () => {
    press('Digit5');
    (visible().querySelector('.item') as HTMLElement).click();
    expect(callbacks.onTraining).toHaveBeenCalledWith('placeholder');
  });

  it('the tactical tab offers Rookie then Ace drills; Enter engages and closes the dashboard', () => {
    press('Digit4');
    expect(overlay.activeTab).toBe('tactical');
    expect(selected()).toContain('Rookie');
    press('ArrowDown');
    expect(selected()).toContain('Ace');
    press('Enter');
    expect(callbacks.onCombat).toHaveBeenCalledWith('ace');
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(overlay.isOpen).toBe(false);
  });

  it('the dashboard can open straight onto the tactical tab (returning from a fight)', () => {
    overlay.close();
    overlay.open(buildDashboardData(input()), callbacks, document.body, 'tactical');
    expect(overlay.activeTab).toBe('tactical');
  });

  it('Esc closes and reports it', () => {
    press('Escape');
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
    expect(document.getElementById('dashboard')).toBeNull();
  });

  it('a held E (the press that opened it) does not close it straight away', () => {
    press('KeyE', true);
    expect(overlay.isOpen).toBe(true);
    press('KeyE');
    expect(overlay.isOpen).toBe(false);
  });

  it('update() refreshes the live readouts and keeps the tab and selection', () => {
    press('Digit3');
    press('ArrowDown');
    overlay.update(
      buildDashboardData(input({ phase: 'cruising', progress: 0.5, destinationId: 'aurelia' })),
    );
    const text = document.getElementById('dashboard')?.textContent ?? '';
    expect(text).toContain('Cruising');
    expect(text).toContain('50%');
    expect(overlay.activeTab).toBe('ship');
    expect(selected()).toBe(shipLayout.rooms[1]?.name);
  });

  it('stops listening for keys once closed', () => {
    overlay.close();
    press('KeyT');
    expect(callbacks.onTraining).not.toHaveBeenCalled();
  });

  it('with no training installed it says so and T does nothing', () => {
    overlay.close();
    overlay.open(buildDashboardData(input({ training: [] })), callbacks);
    expect(document.getElementById('dashboard')?.textContent).toContain('No modules installed');
    press('KeyT');
    expect(callbacks.onTraining).not.toHaveBeenCalled();
    expect(overlay.isOpen).toBe(true);
  });
});

describe('PlayerMode: combat', () => {
  it('a fight is entered from roaming and left back to roaming', () => {
    const mode = new PlayerMode();
    expect(mode.enterCombat()).toEqual({ from: 'roaming', to: 'inCombat' });
    expect(mode.exitToRoaming()).toEqual({ from: 'inCombat', to: 'roaming' });
  });

  it('a fight cannot start on top of the dashboard (it must close first)', () => {
    const mode = new PlayerMode();
    mode.enterDashboard();
    expect(() => mode.enterCombat()).toThrow(/cannot enter inCombat/);
  });
});

describe('PlayerMode: the dashboard', () => {
  it('is entered from roaming and left back to roaming', () => {
    const mode = new PlayerMode();
    expect(mode.enterDashboard()).toEqual({ from: 'roaming', to: 'atDashboard' });
    expect(mode.isRoaming).toBe(false);
    expect(mode.exitToRoaming()).toEqual({ from: 'atDashboard', to: 'roaming' });
  });

  it('cannot be entered from another overlay (programming error)', () => {
    const mode = new PlayerMode();
    mode.enterHelm();
    expect(() => mode.enterDashboard()).toThrow(/cannot enter atDashboard/);
  });
});
