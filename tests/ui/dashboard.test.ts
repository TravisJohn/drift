import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { shipLayout } from '../../src/content/shipLayout';
import { VESSEL_NAME, roomReadouts } from '../../src/content/shipSystems';
import { PlayerMode } from '../../src/state/playerMode';
import { type DashboardInput, buildDashboardData } from '../../src/ui/dashboardModel';
import { type DashboardCallbacks, DashboardOverlay } from '../../src/ui/dashboardOverlay';

const input = (over: Partial<DashboardInput> = {}): DashboardInput => ({
  rooms: shipLayout.rooms,
  podCount: 4,
  phase: 'docked',
  progress: 0,
  locationName: 'Anchorage Point',
  destinationName: null,
  training: [{ id: 'placeholder', title: 'Training console' }],
  ...over,
});
const value = (
  rows: readonly { label: string; value: string }[],
  label: string,
): string | undefined => rows.find((r) => r.label === label)?.value;

describe('buildDashboardData', () => {
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
      input({ phase: 'cruising', progress: 0.426, destinationName: 'Aurelia' }),
    );
    expect(value(data.journey, 'Status')).toBe('Cruising');
    expect(value(data.journey, 'From')).toBe('Anchorage Point');
    expect(value(data.journey, 'To')).toBe('Aurelia');
    expect(value(data.journey, 'Progress')).toBe('43%');
    expect(value(data.systems, 'Autopilot')).toBe('Engaged');
    expect(value(data.systems, 'Reactor')).toBe('Cruise burn');
  });

  it('departure and arrival are shown as manoeuvres, not as a percentage', () => {
    const departing = buildDashboardData(input({ phase: 'departing', destinationName: 'Cinder' }));
    expect(value(departing.journey, 'Progress')).toBe('Departing');
    const arriving = buildDashboardData(input({ phase: 'arriving', destinationName: 'Cinder' }));
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
});

describe('DashboardOverlay', () => {
  let overlay: DashboardOverlay;
  let callbacks: {
    onRoomSelected: Mock<DashboardCallbacks['onRoomSelected']>;
    onTraining: Mock<DashboardCallbacks['onTraining']>;
    onClose: Mock<DashboardCallbacks['onClose']>;
  };
  const press = (code: string, repeat = false): void => {
    document.dispatchEvent(new KeyboardEvent('keydown', { code, repeat }));
  };
  const selected = (): string | null =>
    document.querySelector('#dashboard .item.selected')?.textContent ?? null;

  beforeEach(() => {
    overlay = new DashboardOverlay();
    callbacks = {
      onRoomSelected: vi.fn<DashboardCallbacks['onRoomSelected']>(),
      onTraining: vi.fn<DashboardCallbacks['onTraining']>(),
      onClose: vi.fn<DashboardCallbacks['onClose']>(),
    };
    overlay.open(buildDashboardData(input()), callbacks);
  });

  afterEach(() => {
    overlay.close();
  });

  it('shows the vessel, live readouts, compartments and training', () => {
    const text = document.getElementById('dashboard')?.textContent ?? '';
    expect(text).toContain(VESSEL_NAME);
    expect(text).toContain('Anchorage Point');
    expect(text).toContain('Engineering');
    expect(text).toContain('Training console');
  });

  it('opens on the first compartment and tells the game so (hologram highlight)', () => {
    expect(selected()).toBe(shipLayout.rooms[0]?.name);
    expect(callbacks.onRoomSelected).toHaveBeenLastCalledWith(shipLayout.rooms[0]?.id);
  });

  it('arrow keys move through the compartments and wrap at both ends', () => {
    press('ArrowDown');
    expect(selected()).toBe(shipLayout.rooms[1]?.name);
    expect(callbacks.onRoomSelected).toHaveBeenLastCalledWith(shipLayout.rooms[1]?.id);
    press('ArrowUp');
    press('ArrowUp');
    expect(selected()).toBe(shipLayout.rooms[shipLayout.rooms.length - 1]?.name);
  });

  it("shows the selected compartment's readout", () => {
    press('ArrowDown');
    const second = shipLayout.rooms[1];
    if (!second) throw new Error('layout needs at least two rooms');
    expect(document.querySelector('#dashboard .detail')?.textContent).toBe(roomReadouts[second.id]);
  });

  it('T starts training and closes the dashboard, without also reporting a close', () => {
    press('KeyT');
    expect(callbacks.onTraining).toHaveBeenCalledWith('placeholder');
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(overlay.isOpen).toBe(false);
  });

  it('clicking a training module starts that module', () => {
    (document.querySelector('#dashboard .item.training') as HTMLElement).click();
    expect(callbacks.onTraining).toHaveBeenCalledWith('placeholder');
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

  it('update() refreshes the live readouts and keeps the selection', () => {
    press('ArrowDown');
    overlay.update(
      buildDashboardData(input({ phase: 'cruising', progress: 0.5, destinationName: 'Aurelia' })),
    );
    const text = document.getElementById('dashboard')?.textContent ?? '';
    expect(text).toContain('Cruising');
    expect(text).toContain('50%');
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
