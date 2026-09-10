import { listAreas, listAssignableUsers, listCategories } from "./masters";
import { getStoreSettings } from "./settings";
import { slotLabel } from "@/lib/cleaning/slots";
import { TIME_SLOTS } from "@/config/constants";
import type { CleaningMaster } from "@/lib/types/domain";
import type {
  MasterFormInitial,
  MasterFormOptions,
  ScheduleDraft,
} from "@/components/master/types";

export async function loadMasterFormOptions(): Promise<MasterFormOptions> {
  const [categories, areas, users, store] = await Promise.all([
    listCategories(),
    listAreas(),
    listAssignableUsers(),
    getStoreSettings(),
  ]);
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    areas: areas.map((a) => ({ id: a.id, name: a.name, categoryId: a.categoryId })),
    users: users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      position: u.position,
    })),
    positions: store.positions,
    timeSlots: TIME_SLOTS.map((key) => ({
      key,
      label: slotLabel(key, store.timeSlots),
    })),
  };
}

export function toMasterFormInitial(m: CleaningMaster): MasterFormInitial {
  const schedules: ScheduleDraft[] = m.schedules.map((s) => ({
    key: s.id,
    id: s.id,
    frequency: s.frequency,
    weekdays: s.weekdays,
    daysOfMonthText: s.daysOfMonth.join(", "),
    intervalDays: s.intervalDays,
    anchorDate: s.anchorDate,
    timeSlot: s.timeSlot,
    fixedTime: s.fixedTime ? s.fixedTime.slice(0, 5) : null,
    dueTime: s.dueTime ? s.dueTime.slice(0, 5) : null,
    active: s.active,
  }));
  return {
    id: m.id,
    name: m.name,
    areaId: m.areaId,
    categoryId: m.categoryId,
    description: m.description,
    method: m.method,
    supplies: m.supplies,
    estimatedMinutes: m.estimatedMinutes,
    position: m.position,
    defaultAssigneeId: m.defaultAssigneeId,
    photoRequirement: m.photoRequirement,
    priority: m.priority,
    notes: m.notes,
    active: m.active,
    schedules,
  };
}
