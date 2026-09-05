export function canAddSlotCount(participantCount: number, mapSlotCap: number, isPublic = false) {
  return participantCount < (isPublic ? 2 : mapSlotCap);
}
